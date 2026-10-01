import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { XPost, XUser, MarketSpec } from "@stampd/core";
import type { ExtractedClaim, CheckResult, AiCallLog } from "@stampd/ai";
import type { PrismaClient } from "@stampd/db";
import { startTestDb } from "@stampd/db/testing";
import { STATUS_KEYS } from "@stampd/queue";
import {
  canary,
  checkHealth,
  fetchSubmittedPost,
  fetchTimeline,
  scheduleTimelines,
  type IngestDeps,
} from "../src/jobs/ingest";
import { draftPost, type DraftDeps } from "../src/jobs/draft";
import { fanout } from "../src/jobs/notify";
import { computeEdgeInputs, computeKolStats } from "../src/jobs/stats";
import { ScraperUnavailable, type ScraperHealth } from "../src/lib/scraper";
import { coinbaseDailyClose, binanceDailyClose, evaluate, readyToResolve, toFixed } from "../src/resolver/sources";

let t: Awaited<ReturnType<typeof startTestDb>>;
let db: PrismaClient;
beforeAll(async () => {
  t = await startTestDb();
  db = t.db as unknown as PrismaClient;
}, 60_000);
afterAll(() => t?.stop());
beforeEach(() => t.reset());

const NOW = new Date("2026-09-30T12:00:00Z");

function post(id: string, text: string, extra: Partial<XPost> = {}): XPost {
  return {
    id,
    authorId: "42",
    authorHandle: "example_kol",
    text,
    createdAt: "2026-09-30T10:00:00Z",
    url: `https://x.com/example_kol/status/${id}`,
    ...extra,
  };
}

function harness(opts: { timeline?: XPost[]; posts?: Record<string, XPost>; health?: ScraperHealth | Error } = {}) {
  const jobs: { name: string; data: unknown; opts?: unknown }[] = [];
  const alerts: string[] = [];
  const kv = new Map<string, string>();
  const calls: string[] = [];
  const deps: IngestDeps = {
    db,
    scraper: {
      user: async (handle: string): Promise<XUser> => {
        calls.push(`user:${handle}`);
        return { id: "42", handle, name: "Example KOL", avatarUrl: "https://pbs.twimg.com/a.jpg" };
      },
      timeline: async (_id: string, afterId?: string | null) => {
        calls.push(`timeline:${afterId ?? ""}`);
        return (opts.timeline ?? []).filter((p) => !afterId || BigInt(p.id) > BigInt(afterId));
      },
      post: async (id: string) => opts.posts?.[id] ?? null,
      health: async () => {
        if (opts.health instanceof Error) throw opts.health;
        return opts.health ?? { ok: true, activeAccounts: 5, lockedAccounts: 0, lastSuccessAt: NOW.toISOString(), version: "t" };
      },
    },
    status: { get: async (k) => kv.get(k) ?? null, set: async (k, v) => void kv.set(k, v) },
    alert: async (kind) => void alerts.push(kind),
    enqueue: async (name, data, o) => void jobs.push({ name, data, opts: o }),
    enabled: true,
    minActiveAccounts: 2,
    canaryHandle: "coinbase",
    now: () => NOW,
  };
  return { deps, jobs, alerts, kv, calls };
}

describe("ingest (plan B6b)", () => {
  it("schedules due KOLs only, spread out, and never excluded or untracked ones", async () => {
    await db.kol.createMany({
      data: [
        { xHandle: "due", name: "d" },
        { xHandle: "fresh", name: "f", lastFetchedAt: new Date(NOW.getTime() - 60_000) },
        { xHandle: "gone", name: "g", excluded: true },
        { xHandle: "websub", name: "w", tracked: false },
      ],
    });
    const h = harness();
    expect(await scheduleTimelines(h.deps)).toBe(1);
    expect(h.jobs[0]!.name).toBe("ingest.timeline");
    expect((h.jobs[0]!.opts as { delay: number }).delay).toBeLessThan(60_000);
  });

  it("stores only new posts, drafts the ones past the prefilter, and advances the cursor", async () => {
    const kol = await db.kol.create({ data: { xHandle: "example_kol", name: "E" } });
    const h = harness({
      timeline: [
        post("1873000000000000003", "BTC will close above $90k before end of March"),
        post("1873000000000000002", "gm frens"),
        post("1873000000000000001", "ETH to 10k by EOY", { replyToId: "9" }),
      ],
    });
    await fetchTimeline(h.deps, { kolId: kol.id });
    expect(await db.post.count()).toBe(3);
    expect(h.jobs.filter((j) => j.name === "ai.draft")).toHaveLength(1);
    const k = await db.kol.findUniqueOrThrow({ where: { id: kol.id } });
    expect(k).toMatchObject({ lastSeenPostId: "1873000000000000003", xUserId: "42", avatarUrl: "https://pbs.twimg.com/a.jpg" });

    // second run asks only for newer posts and stores nothing twice
    await fetchTimeline(h.deps, { kolId: kol.id });
    expect(h.calls).toContain("timeline:1873000000000000003");
    expect(await db.post.count()).toBe(3);
    expect(await db.ingestRun.count({ where: { status: "OK" } })).toBe(2);
    expect(h.kv.get(STATUS_KEYS.ingestLastSuccess)).toBeTruthy();
  });

  it("never stores another account's post under the KOL (plan R3)", async () => {
    const kol = await db.kol.create({ data: { xHandle: "example_kol", name: "E" } });
    const h = harness({
      timeline: [
        post("1873000000000000005", "ETH will hit 10k by EOY", { authorId: "999", authorHandle: "someone_else" }),
        post("1873000000000000004", "BTC will close above $90k before end of March"),
      ],
    });
    await fetchTimeline(h.deps, { kolId: kol.id });
    const stored = await db.post.findMany();
    expect(stored.map((p) => p.authorHandle)).toEqual(["example_kol"]);
    expect(h.jobs.filter((j) => j.name === "ai.draft")).toHaveLength(1);
    // the cursor only advances over the KOL's own posts
    expect((await db.kol.findUniqueOrThrow({ where: { id: kol.id } })).lastSeenPostId).toBe("1873000000000000004");
  });

  it("the kill switch stops every scraper call", async () => {
    const kol = await db.kol.create({ data: { xHandle: "example_kol", name: "E" } });
    const h = harness();
    h.deps.enabled = false;
    expect(await fetchTimeline(h.deps, { kolId: kol.id })).toEqual({ skipped: true });
    expect(await scheduleTimelines(h.deps)).toBe(0);
    expect(await checkHealth(h.deps)).toEqual({ healthy: false, reason: "kill switch" });
    expect(h.calls).toEqual([]);
  });

  it("pauses on an unreachable scraper, keeps submissions queued, and catches up on recovery", async () => {
    const down = harness({ health: new ScraperUnavailable("scraper unreachable") });
    expect((await checkHealth(down.deps)).healthy).toBe(false);
    expect(down.kv.get(STATUS_KEYS.ingestPaused)).toBe("1");
    expect(down.alerts).toEqual(["ingest.paused"]);

    await db.user.create({ data: { wallet: "0xsub" } });
    const sub = await db.submission.create({ data: { wallet: "0xsub", xPostUrl: "u", xPostId: "1873000000000000009" } });
    expect(await fetchSubmittedPost(down.deps, { submissionId: sub.id })).toEqual({ queued: true });
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("QUEUED");

    // same status store, scraper healthy again
    const up = harness();
    up.deps.status = down.deps.status;
    expect((await checkHealth(up.deps)).healthy).toBe(true);
    expect(down.kv.get(STATUS_KEYS.ingestPaused)).toBe("0");
    expect(up.jobs.map((j) => j.name)).toEqual(["ingest.reconcile", "ingest.post"]);
    expect(up.alerts).toEqual(["ingest.resumed"]);
  });

  it("pauses when the account pool is too small", async () => {
    const h = harness({ health: { ok: true, activeAccounts: 1, lockedAccounts: 4, lastSuccessAt: NOW.toISOString(), version: "t" } });
    expect(await checkHealth(h.deps)).toEqual({ healthy: false, reason: "only 1 active scraper accounts" });
  });

  it("canary failure pauses ingest", async () => {
    const h = harness({ timeline: [] });
    expect(await canary(h.deps)).toEqual({ ok: false });
    expect(h.kv.get(STATUS_KEYS.ingestPaused)).toBe("1");
  });

  it("web submission: fetches the post, makes an untracked KOL, drafts without the prefilter", async () => {
    await db.user.create({ data: { wallet: "0xsub" } });
    const p = post("1873000000000000010", "gm, this one only a human would submit", { authorHandle: "newkol" });
    const sub = await db.submission.create({ data: { wallet: "0xsub", xPostUrl: p.url, xPostId: p.id } });
    const h = harness({ posts: { [p.id]: p } });
    await fetchSubmittedPost(h.deps, { submissionId: sub.id });
    expect((await db.kol.findUniqueOrThrow({ where: { xHandle: "newkol" } })).tracked).toBe(false);
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("DRAFTED");
    expect(h.jobs[0]).toMatchObject({ name: "ai.draft", data: { source: "WEB", submissionId: sub.id } });
  });

  it("web submission: rejects a missing post and an excluded author", async () => {
    await db.user.create({ data: { wallet: "0xsub" } });
    await db.kol.create({ data: { xHandle: "optout", name: "o", excluded: true } });
    const missing = await db.submission.create({ data: { wallet: "0xsub", xPostUrl: "u", xPostId: "1" } });
    const p = post("2", "BTC to 100k by Friday", { authorHandle: "optout" });
    const excluded = await db.submission.create({ data: { wallet: "0xsub", xPostUrl: "u", xPostId: "2" } });
    const h = harness({ posts: { "2": p } });
    await fetchSubmittedPost(h.deps, { submissionId: missing.id });
    await fetchSubmittedPost(h.deps, { submissionId: excluded.id });
    const rows = await db.submission.findMany({ orderBy: { xPostId: "asc" } });
    expect(rows.map((r) => [r.status, r.reason])).toEqual([
      ["REJECTED", "post not found: it may be deleted or private"],
      ["REJECTED", "this account asked not to be listed"],
    ]);
    expect(h.jobs.filter((j) => j.name === "notify.fanout")).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ drafting

const claim: ExtractedClaim = {
  is_prediction: true,
  subject: "BTC",
  metric: "daily close",
  comparator: ">=",
  threshold: "90000",
  deadline_utc: "2027-03-31T23:59:59Z",
  resolution_source: "coinbase-daily-close",
  question: "Will BTC have a Coinbase daily close at or above $90,000 before 31 Mar 2027?",
  rules: "Resolves YES if any Coinbase BTC-USD daily close (UTC) from market open to the deadline is >= 90000.",
  category: "crypto",
  kol_side: "YES",
  outcome_controlled_by_kol: false,
  confidence: 0.95,
  notes: "",
};
const approve: CheckResult = {
  real_prediction: true,
  question_matches_post: true,
  resolvable_from_source: true,
  neutral_wording: true,
  outcome_not_controlled_by_kol: true,
  verdict: "approve",
  notes: "",
};

function draftHarness(extract: ExtractedClaim | null, check: CheckResult | null, templates: string[] = []) {
  const jobs: { name: string; data: unknown }[] = [];
  const log = (stage: "extract" | "check"): AiCallLog => ({
    stage,
    model: "deepseek-flash",
    inputTokens: 900,
    outputTokens: 150,
    costUsd: 0.00165,
    latencyMs: 800,
    ok: true,
    output: null,
    error: null,
  });
  const deps: DraftDeps = {
    db,
    ai: (onCall) => ({
      extract: async () => (onCall(log("extract")), extract),
      check: async () => (onCall(log("check")), check),
    }),
    enabledTemplates: async () => new Set(templates as never[]),
    enqueue: async (name, data) => void jobs.push({ name, data }),
    now: () => NOW,
  };
  return { deps, jobs };
}

async function seedPost(xPostId = "1873000000000000100") {
  const kol = await db.kol.create({ data: { xHandle: "example_kol", name: "E" } });
  return db.post.create({
    data: {
      xPostId,
      kolId: kol.id,
      authorHandle: "example_kol",
      authorId: "42",
      text: "BTC will close above $90k before end of March",
      postedAt: NOW,
      url: `https://x.com/example_kol/status/${xPostId}`,
    },
  });
}

describe("ai.draft (plan B10a)", () => {
  it("sends a clean draft to review while templates are off, logging both AI calls", async () => {
    const p = await seedPost();
    const h = draftHarness(claim, approve);
    const r = await draftPost(h.deps, { postId: p.id, source: "TIMELINE" });
    expect(r!.route).toBe("REVIEW");
    const pred = await db.prediction.findUniqueOrThrow({ where: { id: r!.predictionId } });
    expect(pred).toMatchObject({ status: "IN_REVIEW", aiDecision: "AUTO_PUBLISH", template: "crypto-major-daily-close" });
    expect(await db.aiCall.count({ where: { predictionId: pred.id } })).toBe(2);
    expect(h.jobs).toEqual([]);
  });

  it("auto-publishes an enabled template and enqueues market creation", async () => {
    const p = await seedPost();
    const h = draftHarness(claim, approve, ["crypto-major-daily-close"]);
    const r = await draftPost(h.deps, { postId: p.id, source: "TIMELINE" });
    expect(r!.route).toBe("AUTO_PUBLISH");
    const pred = await db.prediction.findUniqueOrThrow({ where: { id: r!.predictionId } });
    expect(pred.status).toBe("APPROVED");
    expect((pred.spec as unknown as MarketSpec).closeTime).toBe("2027-03-31T23:59:59.000Z");
    expect(h.jobs).toEqual([{ name: "market.create", data: { predictionId: pred.id } }]);
  });

  it("auto-rejects hard failures without the second AI call and tells the web submitter why", async () => {
    const p = await seedPost();
    await db.user.create({ data: { wallet: "0xsub" } });
    const sub = await db.submission.create({ data: { wallet: "0xsub", xPostUrl: p.url, xPostId: p.xPostId, status: "DRAFTED" } });
    const h = draftHarness({ ...claim, deadline_utc: "" }, approve);
    const r = await draftPost(h.deps, { postId: p.id, source: "WEB", submissionId: sub.id });
    expect(r!.route).toBe("AUTO_REJECT");
    expect(await db.aiCall.count()).toBe(1);
    const s = await db.submission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(s).toMatchObject({ status: "REJECTED", reason: "rejected: the post gives no deadline" });
    expect(h.jobs).toEqual([{ name: "notify.fanout", data: { kind: "submission.updated", submissionId: sub.id } }]);
  });

  it("sends a failed extraction to a human instead of dropping it", async () => {
    const p = await seedPost();
    const r = await draftPost(draftHarness(null, null).deps, { postId: p.id, source: "TIMELINE" });
    expect(r!.route).toBe("REVIEW");
  });

  it("links a second submission of the same post to the existing draft", async () => {
    const p = await seedPost();
    const first = await draftPost(draftHarness(claim, approve).deps, { postId: p.id, source: "TIMELINE" });
    await db.user.create({ data: { wallet: "0xsub" } });
    const sub = await db.submission.create({ data: { wallet: "0xsub", xPostUrl: p.url, xPostId: p.xPostId } });
    const again = await draftPost(draftHarness(claim, approve).deps, { postId: p.id, source: "WEB", submissionId: sub.id });
    expect(again!.predictionId).toBe(first!.predictionId);
    expect(await db.prediction.count()).toBe(1);
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("IN_REVIEW");
  });
});

// ------------------------------------------------------------------ notifications + stats

async function seedOpenMarket() {
  const kol = await db.kol.create({ data: { xHandle: "example_kol", name: "E" } });
  return db.market.create({
    data: {
      chainId: 31337,
      onchainId: 1n,
      kolId: kol.id,
      question: "Will BTC close at or above $90,000?",
      rules: "r",
      spec: {},
      questionHash: "0x01",
      category: "crypto",
      sourcePostId: "1",
      sourcePostUrl: "u",
      kolSide: "YES",
      closeTime: new Date("2026-10-30T00:00:00Z"),
      resolveBy: new Date("2026-10-31T00:00:00Z"),
      status: "OPEN",
      feeBps: 100,
      seedAmount: "0",
      openingYesPriceBps: 5000,
      yesPriceBps: 5000,
      openedAt: new Date("2026-09-28T00:00:00Z"),
      firstTradeAt: new Date("2026-09-28T06:00:00Z"),
      submittedBy: "0xsub",
    },
  });
}

describe("notify.fanout (development plan 6.3)", () => {
  it("new market → followers + submitter (with points), once", async () => {
    const m = await seedOpenMarket();
    await db.user.createMany({ data: [{ wallet: "0xfan" }, { wallet: "0xsub" }] });
    await db.follow.create({ data: { userWallet: "0xfan", kolId: m.kolId } });
    const published: string[] = [];
    const publish = async (w: string) => void published.push(w);
    expect(await fanout(db, publish, { kind: "market.opened", marketId: m.id })).toBe(1);
    expect(published.sort()).toEqual(["0xfan", "0xsub"]);
    expect((await db.user.findUniqueOrThrow({ where: { wallet: "0xsub" } })).points).toBe(10);

    // retried job: nothing new, no double points
    expect(await fanout(db, publish, { kind: "market.opened", marketId: m.id })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { wallet: "0xsub" } })).points).toBe(10);
  });

  it("resolution → watchers and holders; redeemable only for winners", async () => {
    const m = await seedOpenMarket();
    await db.market.update({ where: { id: m.id }, data: { status: "RESOLVED", result: "YES" } });
    await db.user.createMany({ data: [{ wallet: "0xwatch" }, { wallet: "0xwin" }, { wallet: "0xlose" }] });
    await db.watch.create({ data: { userWallet: "0xwatch", marketId: m.id } });
    await db.position.createMany({
      data: [
        { wallet: "0xwin", marketId: m.id, yesShares: "5000000" },
        { wallet: "0xlose", marketId: m.id, noShares: "5000000" },
        { wallet: "0xnotauser", marketId: m.id, yesShares: "1" },
      ],
    });
    await fanout(db, async () => {}, { kind: "market.resolved", marketId: m.id });
    const rows = await db.notification.findMany({ orderBy: [{ userWallet: "asc" }, { type: "asc" }] });
    expect(rows.map((r) => `${r.userWallet}:${r.type}`).sort()).toEqual(["0xlose:RESOLVED", "0xwatch:RESOLVED", "0xwin:RESOLVED", "0xwin:REDEEMABLE"].sort());
  });
});

describe("stats (development plan 6.1)", () => {
  it("computes the 24h KOL-side TWAP from the first trade and counts verified traders", async () => {
    const m = await seedOpenMarket();
    await db.pricePoint.createMany({
      data: [
        { marketId: m.id, t: new Date("2026-09-28T00:00:00Z"), yesPriceBps: 5000, source: "open" },
        { marketId: m.id, t: new Date("2026-09-28T06:00:00Z"), yesPriceBps: 3000, source: "trade" },
        { marketId: m.id, t: new Date("2026-09-28T18:00:00Z"), yesPriceBps: 4000, source: "trade" },
      ],
    });
    await db.user.createMany({ data: [{ wallet: "0xa", captchaVerifiedAt: NOW }, { wallet: "0xb" }] });
    const trade = (w: string, h: number, i: number) => ({
      txHash: `0x${i}`,
      logIndex: 0,
      marketId: m.id,
      wallet: w,
      outcome: "YES" as const,
      isBuy: true,
      collateral: "1",
      shares: "1",
      fee: "0",
      priceAfterBps: 3000,
      blockNumber: BigInt(i),
      blockTime: new Date(Date.UTC(2026, 8, 28, h)),
    });
    await db.trade.createMany({ data: [trade("0xa", 6, 1), trade("0xb", 18, 2)] });

    expect(await computeEdgeInputs(db, NOW)).toBe(1);
    const after = await db.market.findUniqueOrThrow({ where: { id: m.id } });
    // 3000 for 12h then 4000 for 6h (window ends 24h after opening) → 3333
    expect(after.kolSideTwap24hBps).toBe(3333);
    expect(after.uniqueVerifiedTraders24h).toBe(1);
  });

  it("KOL stats: hit rate and edge with n", async () => {
    const m = await seedOpenMarket();
    await db.market.update({
      where: { id: m.id },
      data: { status: "RESOLVED", result: "YES", kolSideTwap24hBps: 3000, uniqueVerifiedTraders24h: 12 },
    });
    await computeKolStats(db, m.kolId, NOW);
    const s = await db.kolStats.findUniqueOrThrow({ where: { kolId: m.kolId } });
    expect(s).toMatchObject({ resolved: 1, correct: 1, hitRate: 1, edgeN: 1 });
    expect(s.avgEdge).toBeCloseTo(0.7, 10);
  });
});

// ------------------------------------------------------------------ resolution sources (development plan 5.1)

describe("resolution sources", () => {
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
  const spec = (mode: "any-close-before" | "close-on", comparator: ">=" | "<" = ">=") =>
    ({ resolution: { comparator, threshold: "90000", mode } }) as unknown as MarketSpec;
  const closes = [
    { day: "2027-03-29", start: day("2027-03-29"), close: "88000.5" },
    { day: "2027-03-30", start: day("2027-03-30"), close: "90000.00" },
    { day: "2027-03-31", start: day("2027-03-31"), close: "89999.99" },
  ];
  const opened = new Date("2027-03-29T15:00:00Z");
  const close = new Date("2027-03-31T23:59:59Z");

  it("any close before the deadline", () => {
    const v = evaluate(spec("any-close-before"), closes, opened, close);
    expect(v.outcome).toBe("YES");
    expect(v.matched!.day).toBe("2027-03-30");
    expect(v.considered).toEqual({ from: "2027-03-29", to: "2027-03-31", days: 3 });
  });

  it("close on the deadline day only", () => {
    expect(evaluate(spec("close-on"), closes, opened, close).outcome).toBe("NO");
    expect(evaluate(spec("close-on", "<"), closes, opened, close).outcome).toBe("YES");
  });

  it("refuses to resolve with a missing day", () => {
    expect(() => evaluate(spec("any-close-before"), [closes[0]!, closes[2]!], opened, close)).toThrow("missing daily close for 2027-03-30");
  });

  it("waits until the last candle is final", () => {
    expect(readyToResolve(close, new Date("2027-03-31T23:59:59Z"))).toBe(false);
    expect(readyToResolve(close, new Date("2027-04-01T00:11:00Z"))).toBe(true);
  });

  it("compares decimals exactly", () => {
    expect(toFixed("90000.00")).toBe(toFixed("90000"));
    expect(toFixed("89999.999999999999")).toBeLessThan(toFixed("90000"));
    expect(toFixed("1e-7")).toBe(100_000n);
  });

  it("coinbase adapter pages 300 candles at a time and keeps closes as text", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      const start = Date.parse(new URL(url).searchParams.get("start")!) / 1000;
      return new Response(JSON.stringify([[start, 1, 2, 1, 65432.12, 10]]));
    }) as unknown as typeof fetch;
    const r = await coinbaseDailyClose("BTC-USD", new Date("2026-01-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z"), fetcher);
    expect(urls).toHaveLength(2);
    expect(r.closes[0]).toEqual({ day: "2026-01-01", start: day("2026-01-01"), close: "65432.12" });
  });

  it("binance adapter parses string closes", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify([[day("2026-01-01") * 1000, "1", "2", "0.5", "93000.10000000"]]))) as unknown as typeof fetch;
    const r = await binanceDailyClose("BTCUSDT", new Date("2026-01-01"), new Date("2026-01-01"), fetcher);
    expect(r.closes).toEqual([{ day: "2026-01-01", start: day("2026-01-01"), close: "93000.10000000" }]);
  });
});
