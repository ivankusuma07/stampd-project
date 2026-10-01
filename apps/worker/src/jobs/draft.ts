import { questionHash, type XPost } from "@stampd/core";
import {
  buildSpec,
  type AiCallLog,
  type CheckResult,
  type ExtractedClaim,
  type ClaimAi,
  routeDraft,
  validateClaim,
  VALIDATOR_MESSAGES,
  type TemplateId,
} from "@stampd/ai";
import type { Prisma, PrismaClient } from "@stampd/db";
import type { JobMap } from "@stampd/queue";

export type DraftDeps = {
  db: PrismaClient;
  /** Builds the AI client for one job; every API attempt is reported to `onCall`. */
  ai: (onCall: (log: AiCallLog) => void) => Pick<ClaimAi, "extract" | "check">;
  enabledTemplates: () => Promise<Set<TemplateId>>;
  enqueue: <N extends "market.create" | "notify.fanout">(name: N, data: JobMap[N], opts?: { jobId?: string }) => Promise<unknown>;
  now?: () => Date;
};

/** Defaults for auto-published markets; reviewers set their own on approval. */
export const AUTO_DEFAULTS = { seed: 200_000_000n, openingPriceBps: 5000, feeBps: 100 };

/**
 * `ai.draft` (plan B6 #2 + B10a): extract → code validators → check pass → route.
 * One prediction per post; a web submission for an already-drafted post just links to it.
 */
export async function draftPost(d: DraftDeps, job: JobMap["ai.draft"]): Promise<{ predictionId: string; route: string } | null> {
  const now = d.now?.() ?? new Date();
  const post = await d.db.post.findUniqueOrThrow({ where: { id: job.postId }, include: { kol: true } });

  const existing = await d.db.prediction.findFirst({ where: { postId: post.id } });
  if (existing) {
    if (job.submissionId) await linkSubmission(d, job.submissionId, existing.id, existing.status);
    return { predictionId: existing.id, route: existing.route ?? "EXISTING" };
  }

  const xpost: XPost = {
    id: post.xPostId,
    authorId: post.authorId,
    authorHandle: post.authorHandle,
    text: post.text,
    createdAt: post.postedAt.toISOString(),
    url: post.url,
  };
  const calls: AiCallLog[] = [];
  const ai = d.ai((log) => void calls.push(log));
  const saveCalls = (predictionId: string) =>
    d.db.aiCall.createMany({
      data: calls.map((c) => ({
        predictionId,
        stage: c.stage,
        model: c.model,
        inputTokens: c.inputTokens,
        outputTokens: c.outputTokens,
        costUsd: c.costUsd.toFixed(6),
        latencyMs: c.latencyMs,
        ok: c.ok,
        output: (c.output ?? undefined) as Prisma.InputJsonValue | undefined,
        error: c.error,
      })),
    });

  const claim = await ai.extract(xpost, now);
  if (!claim) {
    // Two invalid AI outputs: a human looks at it rather than dropping a possible call.
    const p = await d.db.prediction.create({
      data: {
        postId: post.id,
        source: job.source,
        submittedBy: await submitter(d, job.submissionId),
        status: "IN_REVIEW",
        route: "REVIEW",
        aiDecision: "REVIEW",
        validatorErrors: [],
        reviewReason: "AI extraction failed twice",
      },
    });
    await saveCalls(p.id);
    if (job.submissionId) await linkSubmission(d, job.submissionId, p.id, "IN_REVIEW");
    return { predictionId: p.id, route: "REVIEW" };
  }

  const { deadline, validation } = await validate(d.db, post, xpost, claim, now);

  // Skip the second call when code already rules the draft out.
  const check = validation.hard.length === 0 ? await ai.check(xpost, claim, now) : null;
  const decision = routeDraft({ claim, check, validation, enabledTemplates: await d.enabledTemplates() });

  const status = decision.route === "AUTO_REJECT" ? "REJECTED" : decision.route === "AUTO_PUBLISH" ? "APPROVED" : "IN_REVIEW";
  const spec = decision.route === "AUTO_PUBLISH" && deadline ? buildSpec(claim, xpost, deadline) : null;
  const p = await d.db.prediction.create({
    data: {
      postId: post.id,
      source: job.source,
      submittedBy: await submitter(d, job.submissionId),
      status,
      extracted: claim as unknown as Prisma.InputJsonValue,
      check: (check ?? undefined) as Prisma.InputJsonValue | undefined,
      validatorErrors: validation.errors,
      route: decision.route,
      template: decision.template,
      aiDecision: decision.aiDecision,
      reviewReason: decision.route === "AUTO_REJECT" ? reasonText(decision.reasons) : null,
      ...(spec
        ? {
            spec: spec as unknown as Prisma.InputJsonValue,
            seedAmount: AUTO_DEFAULTS.seed.toString(),
            openingPriceBps: AUTO_DEFAULTS.openingPriceBps,
            feeBps: AUTO_DEFAULTS.feeBps,
          }
        : {}),
    },
  });

  await saveCalls(p.id);

  if (job.submissionId) await linkSubmission(d, job.submissionId, p.id, status, p.reviewReason);
  if (decision.route === "AUTO_PUBLISH") await d.enqueue("market.create", { predictionId: p.id }, { jobId: `create:${p.id}` });
  return { predictionId: p.id, route: decision.route };
}

/** Code validators for a claim: deadline, duplicate market (same post or same question), exclusions. */
async function validate(
  db: PrismaClient,
  post: { xPostId: string; kol: { excluded: boolean } | null },
  xpost: XPost,
  claim: ExtractedClaim,
  now: Date,
) {
  const deadline = claim.deadline_utc ? new Date(claim.deadline_utc) : null;
  const hash = deadline && !Number.isNaN(deadline.getTime()) ? questionHash(buildSpec(claim, xpost, deadline)) : null;
  const duplicate =
    (await db.market.count({
      where: { OR: [{ sourcePostId: post.xPostId }, ...(hash ? [{ questionHash: hash }] : [])] },
    })) > 0;
  const validation = validateClaim(claim, { now, kolExcluded: post.kol?.excluded ?? false, isDuplicate: duplicate });
  return { deadline, validation };
}

export type RerouteDeps = Pick<DraftDeps, "db" | "enabledTemplates" | "enqueue" | "now">;

/**
 * Re-run routing for drafts waiting in review, with their stored AI answers (no new AI calls), after
 * the auto-publish bar or the enabled templates change. It only ever publishes: a draft that no longer
 * qualifies (e.g. its deadline passed) is left where it is.
 */
export async function rerouteWaiting(d: RerouteDeps): Promise<{ checked: number; published: string[]; waitingForTemplate: number }> {
  const now = d.now?.() ?? new Date();
  const enabled = await d.enabledTemplates();
  const waiting = await d.db.prediction.findMany({
    where: { status: "IN_REVIEW", humanDecision: null },
    include: { post: { include: { kol: true } } },
  });
  const published: string[] = [];
  let waitingForTemplate = 0;
  for (const p of waiting) {
    const claim = p.extracted as unknown as ExtractedClaim | null;
    const check = p.check as unknown as CheckResult | null;
    if (!claim || !check) continue; // needs both AI passes on record
    const xpost: XPost = {
      id: p.post.xPostId,
      authorId: p.post.authorId,
      authorHandle: p.post.authorHandle,
      text: p.post.text,
      createdAt: p.post.postedAt.toISOString(),
      url: p.post.url,
    };
    const { deadline, validation } = await validate(d.db, p.post, xpost, claim, now);
    const decision = routeDraft({ claim, check, validation, enabledTemplates: enabled });
    if (decision.aiDecision === "AUTO_PUBLISH" && decision.route !== "AUTO_PUBLISH") waitingForTemplate++;
    if (decision.route !== "AUTO_PUBLISH" || !deadline) continue;
    await d.db.prediction.update({
      where: { id: p.id },
      data: {
        status: "APPROVED",
        route: "AUTO_PUBLISH",
        aiDecision: decision.aiDecision,
        template: decision.template,
        spec: buildSpec(claim, xpost, deadline) as unknown as Prisma.InputJsonValue,
        seedAmount: AUTO_DEFAULTS.seed.toString(),
        openingPriceBps: AUTO_DEFAULTS.openingPriceBps,
        feeBps: AUTO_DEFAULTS.feeBps,
      },
    });
    await d.enqueue("market.create", { predictionId: p.id }, { jobId: `create:${p.id}` });
    published.push(p.id);
  }
  return { checked: waiting.length, published, waitingForTemplate };
}

function reasonText(codes: string[]): string {
  const msgs = codes.map((c) => VALIDATOR_MESSAGES[c as keyof typeof VALIDATOR_MESSAGES] ?? c);
  return `rejected: ${msgs.join("; ")}`;
}

async function submitter(d: DraftDeps, submissionId?: string): Promise<string | null> {
  if (!submissionId) return null;
  return (await d.db.submission.findUnique({ where: { id: submissionId }, select: { wallet: true } }))?.wallet ?? null;
}

async function linkSubmission(d: DraftDeps, submissionId: string, predictionId: string, status: string, reason?: string | null) {
  const map: Record<string, "IN_REVIEW" | "APPROVED" | "REJECTED"> = {
    DRAFT: "IN_REVIEW",
    IN_REVIEW: "IN_REVIEW",
    APPROVED: "APPROVED",
    PUBLISHED: "APPROVED",
    REJECTED: "REJECTED",
  };
  const next = map[status] ?? "IN_REVIEW";
  await d.db.submission.update({ where: { id: submissionId }, data: { predictionId, status: next, reason: reason ?? null } });
  if (next === "REJECTED") await d.enqueue("notify.fanout", { kind: "submission.updated", submissionId });
}
