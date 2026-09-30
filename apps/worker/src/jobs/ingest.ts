import type { XPost } from "@stampd/core";
import { prefilter } from "@stampd/ai";
import type { PrismaClient } from "@stampd/db";
import { STATUS_KEYS, type JobMap } from "@stampd/queue";
import type { Alerter } from "../lib/alerts";
import { idGreater, ScraperUnavailable, type ScraperClient } from "../lib/scraper";

export type Status = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<unknown> };

export type IngestDeps = {
  db: PrismaClient;
  scraper: Pick<ScraperClient, "timeline" | "post" | "user" | "health">;
  status: Status;
  alert: Alerter;
  enqueue: <N extends "ingest.timeline" | "ingest.post" | "ai.draft" | "ingest.reconcile" | "notify.fanout">(
    name: N,
    data: JobMap[N],
    opts?: { jobId?: string; delay?: number },
  ) => Promise<unknown>;
  enabled: boolean;
  minActiveAccounts: number;
  canaryHandle: string;
  now?: () => Date;
};

const PROFILE_REFRESH_MS = 24 * 3600 * 1000;
const STALE_SUCCESS_MS = 30 * 60 * 1000;

/** Ingest runs only when the kill switch is on and the health guard hasn't paused it (plan B6b). */
async function canRun(d: IngestDeps): Promise<boolean> {
  if (!d.enabled) return false;
  return (await d.status.get(STATUS_KEYS.ingestPaused)) !== "1";
}

/** Stable 0–59s offset per KOL so jobs are spread out instead of fired at once. */
function jitterMs(key: string): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 60) * 1000;
}

/** `ingest.schedule` (every minute): enqueue timeline fetches for KOLs that are due. */
export async function scheduleTimelines(d: IngestDeps): Promise<number> {
  if (!(await canRun(d))) return 0;
  const now = d.now?.() ?? new Date();
  const kols = await d.db.kol.findMany({ where: { tracked: true, excluded: false } });
  let queued = 0;
  for (const k of kols) {
    const due = !k.lastFetchedAt || k.lastFetchedAt.getTime() + k.pollIntervalMin * 60_000 <= now.getTime();
    if (!due) continue;
    const slot = Math.floor(now.getTime() / (k.pollIntervalMin * 60_000));
    await d.enqueue("ingest.timeline", { kolId: k.id }, { jobId: `timeline:${k.id}:${slot}`, delay: jitterMs(k.id) });
    queued++;
  }
  return queued;
}

/**
 * Store a KOL's posts (deduped by X id) and queue drafts for the ones that pass the prefilter.
 * Posts by anyone other than `authorId` are dropped: a timeline can carry other people's posts
 * from conversations, and those must never be attributed to the KOL (plan R3).
 */
async function storePosts(
  d: IngestDeps,
  kolId: string,
  authorId: string,
  posts: XPost[],
): Promise<{ stored: number; drafted: number; own: XPost[] }> {
  let stored = 0;
  let drafted = 0;
  const own = posts.filter((p) => p.authorId === authorId);
  for (const p of own) {
    const exists = await d.db.post.findUnique({ where: { xPostId: p.id }, select: { id: true } });
    if (exists) continue;
    const row = await d.db.post.create({
      data: {
        xPostId: p.id,
        kolId,
        authorHandle: p.authorHandle,
        authorId: p.authorId,
        text: p.text,
        postedAt: new Date(p.createdAt),
        url: p.url,
        replyToId: p.replyToId ?? null,
        quotedId: p.quotedId ?? null,
        isRepost: p.isRepost ?? false,
      },
    });
    stored++;
    if (prefilter(p).keep) {
      await d.enqueue("ai.draft", { postId: row.id, source: "TIMELINE" }, { jobId: `draft:${row.id}` });
      drafted++;
    }
  }
  return { stored, drafted, own };
}

async function recordRun<T>(d: IngestDeps, jobType: string, kolId: string | null, fn: () => Promise<{ posts: number; result: T }>) {
  const run = await d.db.ingestRun.create({ data: { jobType, kolId } });
  try {
    const { posts, result } = await fn();
    await d.db.ingestRun.update({ where: { id: run.id }, data: { status: "OK", postsReturned: posts, finishedAt: new Date() } });
    await d.status.set(STATUS_KEYS.ingestLastSuccess, new Date().toISOString());
    return result;
  } catch (err) {
    await d.db.ingestRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: (err as Error).message.slice(0, 1000), finishedAt: new Date() },
    });
    if (err instanceof ScraperUnavailable) await pause(d, err.message);
    throw err;
  }
}

/** `ingest.timeline`: fetch posts newer than the last one seen for this KOL. */
export async function fetchTimeline(d: IngestDeps, { kolId }: JobMap["ingest.timeline"]) {
  if (!(await canRun(d))) return { skipped: true };
  const kol = await d.db.kol.findUniqueOrThrow({ where: { id: kolId } });
  if (kol.excluded || !kol.tracked) return { skipped: true };

  return recordRun(d, "timeline", kol.id, async () => {
    let { xUserId } = kol;
    const now = d.now?.() ?? new Date();
    if (!xUserId || !kol.profileRefreshedAt || now.getTime() - kol.profileRefreshedAt.getTime() > PROFILE_REFRESH_MS) {
      const user = await d.scraper.user(kol.xHandle);
      if (!user) throw new Error(`@${kol.xHandle} not found on X`);
      xUserId = user.id;
      await d.db.kol.update({
        where: { id: kol.id },
        data: { xUserId: user.id, name: user.name, avatarUrl: user.avatarUrl, profileRefreshedAt: now },
      });
    }
    const posts = await d.scraper.timeline(xUserId, kol.lastSeenPostId);
    const { stored, drafted, own } = await storePosts(d, kol.id, xUserId, posts);
    const newest = own.reduce<string | null>((max, p) => (!max || idGreater(p.id, max) ? p.id : max), kol.lastSeenPostId);
    await d.db.kol.update({ where: { id: kol.id }, data: { lastSeenPostId: newest, lastFetchedAt: now } });
    return { posts: posts.length, result: { stored, drafted } };
  });
}

/** `ingest.post`: a pasted link from /submit (plan B2 feature 1). Left QUEUED while ingest is paused. */
export async function fetchSubmittedPost(d: IngestDeps, { submissionId }: JobMap["ingest.post"]) {
  const sub = await d.db.submission.findUniqueOrThrow({ where: { id: submissionId } });
  if (sub.status !== "QUEUED") return { skipped: true };
  if (!(await canRun(d))) return { queued: true };

  await d.db.submission.update({ where: { id: sub.id }, data: { attempts: { increment: 1 } } });
  return recordRun<{ rejected?: true; drafted?: true }>(d, "post", null, async () => {
    const existing = await d.db.post.findUnique({ where: { xPostId: sub.xPostId } });
    const post = existing ? null : await d.scraper.post(sub.xPostId);
    if (!existing && !post) {
      await reject(d, sub.id, "post not found — it may be deleted or private");
      return { posts: 0, result: { rejected: true as const } };
    }
    const handle = existing?.authorHandle ?? post!.authorHandle;
    const kol = await d.db.kol.upsert({
      where: { xHandle: handle },
      update: {},
      create: { xHandle: handle, name: handle, tracked: false, xUserId: post?.authorId },
    });
    if (kol.excluded) {
      await reject(d, sub.id, "this account asked not to be listed");
      return { posts: 1, result: { rejected: true as const } };
    }
    const row =
      existing ??
      (await d.db.post.create({
        data: {
          xPostId: post!.id,
          kolId: kol.id,
          authorHandle: post!.authorHandle,
          authorId: post!.authorId,
          text: post!.text,
          postedAt: new Date(post!.createdAt),
          url: post!.url,
          replyToId: post!.replyToId ?? null,
          quotedId: post!.quotedId ?? null,
          isRepost: post!.isRepost ?? false,
        },
      }));
    await d.db.submission.update({ where: { id: sub.id }, data: { status: "DRAFTED" } });
    // A person chose this post, so it skips the timeline prefilter and goes straight to the AI.
    await d.enqueue("ai.draft", { postId: row.id, source: "WEB", submissionId: sub.id }, { jobId: `draft:web:${sub.id}` });
    return { posts: 1, result: { drafted: true as const } };
  });
}

async function reject(d: IngestDeps, submissionId: string, reason: string) {
  await d.db.submission.update({ where: { id: submissionId }, data: { status: "REJECTED", reason } });
  await d.enqueue("notify.fanout", { kind: "submission.updated", submissionId });
}

async function pause(d: IngestDeps, reason: string) {
  if ((await d.status.get(STATUS_KEYS.ingestPaused)) === "1") return;
  await d.status.set(STATUS_KEYS.ingestPaused, "1");
  await d.status.set(STATUS_KEYS.ingestPausedReason, reason);
  await d.alert("ingest.paused", `New markets paused: ${reason}`);
}

async function resume(d: IngestDeps) {
  await d.status.set(STATUS_KEYS.ingestPaused, "0");
  await d.status.set(STATUS_KEYS.ingestPausedReason, "");
  // Catch up: posts missed during the outage, then submissions that queued while it was down.
  await d.enqueue("ingest.reconcile", {}, { jobId: `reconcile:resume:${Date.now()}` });
  const queued = await d.db.submission.findMany({ where: { status: "QUEUED" }, select: { id: true } });
  for (const s of queued) await d.enqueue("ingest.post", { submissionId: s.id }, { jobId: `submission:${s.id}:retry:${Date.now()}` });
}

/**
 * `ingest.health` (every minute): pause ingest when the scraper is unreachable, the account
 * pool is too small, or nothing has succeeded for 30 minutes; resume when it recovers.
 */
export async function checkHealth(d: IngestDeps): Promise<{ healthy: boolean; reason?: string }> {
  if (!d.enabled) {
    await d.status.set(STATUS_KEYS.ingestPaused, "1");
    await d.status.set(STATUS_KEYS.ingestPausedReason, "scraping disabled (kill switch)");
    return { healthy: false, reason: "kill switch" };
  }
  let reason: string | undefined;
  try {
    const h = await d.scraper.health();
    await d.status.set(STATUS_KEYS.scraperHealth, JSON.stringify({ ...h, checkedAt: new Date().toISOString() }));
    const now = d.now?.() ?? new Date();
    if (h.activeAccounts < d.minActiveAccounts) reason = `only ${h.activeAccounts} active scraper accounts`;
    else if (h.lastSuccessAt && now.getTime() - new Date(h.lastSuccessAt).getTime() > STALE_SUCCESS_MS) {
      reason = `no successful fetch since ${h.lastSuccessAt}`;
    }
  } catch (err) {
    reason = (err as Error).message;
    await d.status.set(STATUS_KEYS.scraperHealth, JSON.stringify({ ok: false, error: reason, checkedAt: new Date().toISOString() }));
  }
  const paused = (await d.status.get(STATUS_KEYS.ingestPaused)) === "1";
  if (reason) {
    await pause(d, reason);
    return { healthy: false, reason };
  }
  if (paused) {
    await resume(d);
    await d.alert("ingest.resumed", "Scraper healthy again; ingest resumed and catching up");
  }
  return { healthy: true };
}

/** `ingest.canary` (daily): one known public account must return posts, or ingest pauses. */
export async function canary(d: IngestDeps) {
  if (!d.enabled) return { skipped: true };
  try {
    const user = await d.scraper.user(d.canaryHandle);
    const posts = user ? await d.scraper.timeline(user.id) : [];
    if (posts.length === 0) throw new Error(`canary @${d.canaryHandle} returned no posts`);
    return { ok: true, posts: posts.length };
  } catch (err) {
    await pause(d, `canary failed: ${(err as Error).message}`);
    return { ok: false };
  }
}

/**
 * `ingest.reconcile` (daily and after an outage): re-read each KOL's latest page to catch missed
 * posts, and mark posts behind open markets that were deleted on X (plan R4).
 */
export async function reconcileIngest(d: IngestDeps) {
  if (!(await canRun(d))) return { skipped: true };
  return recordRun(d, "reconcile", null, async () => {
    let total = 0;
    const kols = await d.db.kol.findMany({ where: { tracked: true, excluded: false, xUserId: { not: null } } });
    for (const k of kols) {
      const posts = await d.scraper.timeline(k.xUserId!);
      total += posts.length;
      await storePosts(d, k.id, k.xUserId!, posts);
    }
    const live = await d.db.post.findMany({
      where: { deletedAt: null, predictions: { some: { market: { status: { in: ["OPEN", "PROPOSED", "DISPUTED"] } } } } },
      select: { id: true, xPostId: true },
    });
    for (const p of live) {
      if (!(await d.scraper.post(p.xPostId))) {
        await d.db.post.update({ where: { id: p.id }, data: { deletedAt: new Date(), text: "" } });
      }
    }
    return { posts: total, result: { kols: kols.length } };
  });
}
