import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { STATUS_KEYS } from "@stampd/queue";
import { CATEGORIES, questionHash, type XPost } from "@stampd/core";
import { TEMPLATES, buildSpec, validateClaim, VALIDATOR_MESSAGES, type ExtractedClaim } from "@stampd/ai";
import type { Prisma } from "@stampd/db";
import { marketDto } from "../lib/dto";

const USD = 1_000_000n;

/**
 * Admin (wallet allowlist). Onchain admin actions — pausing a market, arbitrating a dispute —
 * are signed in the browser by the admin's own wallet; these routes cover the off-chain side.
 * Every write is recorded in AdminAudit.
 */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { deps } = app;
  const { db } = deps;
  app.addHook("preHandler", app.requireAdmin);

  const audit = (adminWallet: string, action: string, target: string | null, data?: Prisma.InputJsonValue) =>
    db.adminAudit.create({ data: { adminWallet, action, target, data } });

  // ------------------------------------------------------------------ review queue (development plan 4.6)

  app.get(
    "/queue",
    { schema: { querystring: z.object({ status: z.enum(["IN_REVIEW", "REJECTED", "APPROVED", "PUBLISHED"]).default("IN_REVIEW") }) } },
    async (req) => {
      const rows = await db.prediction.findMany({
        where: { status: req.query.status },
        include: { post: { include: { kol: true } }, submissions: { select: { wallet: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      return {
        items: rows.map((p) => ({
          id: p.id,
          status: p.status,
          source: p.source,
          submittedBy: p.submittedBy,
          route: p.route,
          aiDecision: p.aiDecision,
          template: p.template,
          extracted: p.extracted,
          check: p.check,
          validatorErrors: (p.validatorErrors as string[]).map((code) => ({
            code,
            message: VALIDATOR_MESSAGES[code as keyof typeof VALIDATOR_MESSAGES] ?? code,
          })),
          reviewReason: p.reviewReason,
          createError: p.createError,
          createdAt: p.createdAt.toISOString(),
          post: {
            xPostId: p.post.xPostId,
            text: p.post.text,
            url: p.post.url,
            authorHandle: p.post.authorHandle,
            postedAt: p.post.postedAt.toISOString(),
            kolExcluded: p.post.kol?.excluded ?? false,
          },
        })),
      };
    },
  );

  const Edits = z.object({
    question: z.string().trim().min(10).max(300).optional(),
    rules: z.string().trim().min(20).max(3000).optional(),
    deadline_utc: z.string().datetime().optional(),
    subject: z.string().trim().max(20).optional(),
    metric: z.string().trim().max(40).optional(),
    comparator: z.enum([">=", "<=", ">", "<"]).optional(),
    threshold: z.string().trim().regex(/^\d+(\.\d+)?$/).optional(),
    resolution_source: z.string().trim().max(60).optional(),
    category: z.enum(CATEGORIES).optional(),
    kol_side: z.enum(["YES", "NO"]).optional(),
  });

  app.post(
    "/predictions/:id/approve",
    {
      schema: {
        params: z.object({ id: z.string().max(40) }),
        body: z.object({
          edits: Edits.default({}),
          openingPriceBps: z.number().int().min(100).max(9900).default(5000),
          seedUsd: z.number().int().min(10).max(10_000).default(200),
          feeBps: z.number().int().min(0).max(1000).default(100),
        }),
      },
    },
    async (req, reply) => {
      const p = await db.prediction.findUnique({ where: { id: req.params.id }, include: { post: { include: { kol: true } } } });
      if (!p) return reply.code(404).send({ error: "not found" });
      if (p.status !== "IN_REVIEW" && p.status !== "DRAFT") return reply.code(409).send({ error: `already ${p.status}` });
      if (!p.extracted) return reply.code(409).send({ error: "no draft to approve" });

      const edits = Object.fromEntries(Object.entries(req.body.edits).filter(([, v]) => v !== undefined));
      const claim = { ...(p.extracted as ExtractedClaim), ...edits, is_prediction: true } as ExtractedClaim;
      const post: XPost = {
        id: p.post.xPostId,
        authorId: p.post.authorId,
        authorHandle: p.post.authorHandle,
        text: p.post.text,
        createdAt: p.post.postedAt.toISOString(),
        url: p.post.url,
      };
      const deadline = new Date(claim.deadline_utc);
      const spec = buildSpec(claim, post, deadline);
      const hash = questionHash(spec);
      const duplicate = (await db.market.count({ where: { questionHash: hash } })) > 0;
      // Soft failures are the reviewer's call; hard ones can never be listed.
      const v = validateClaim(claim, { now: deps.now(), kolExcluded: p.post.kol?.excluded ?? false, isDuplicate: duplicate });
      if (v.hard.length > 0) {
        return reply.code(422).send({ error: "cannot list", codes: v.hard, messages: v.hard.map((c) => VALIDATOR_MESSAGES[c]) });
      }

      await db.prediction.update({
        where: { id: p.id },
        data: {
          status: "APPROVED",
          humanDecision: "approve",
          edited: Object.keys(edits).length > 0,
          reviewerWallet: req.wallet!,
          reviewedAt: deps.now(),
          spec: spec as unknown as Prisma.InputJsonValue,
          seedAmount: (BigInt(req.body.seedUsd) * USD).toString(),
          openingPriceBps: req.body.openingPriceBps,
          feeBps: req.body.feeBps,
          createError: null,
        },
      });
      await db.submission.updateMany({ where: { predictionId: p.id }, data: { status: "APPROVED", reason: null } });
      await audit(req.wallet!, "prediction.approve", p.id, { edits, questionHash: hash } as Prisma.InputJsonValue);
      await deps.enqueue("market.create", { predictionId: p.id }, { jobId: `create:${p.id}` });
      return { ok: true, questionHash: hash, softWarnings: v.soft };
    },
  );

  app.post(
    "/predictions/:id/reject",
    { schema: { params: z.object({ id: z.string().max(40) }), body: z.object({ reason: z.string().trim().min(3).max(500) }) } },
    async (req, reply) => {
      const p = await db.prediction.findUnique({ where: { id: req.params.id } });
      if (!p) return reply.code(404).send({ error: "not found" });
      if (p.status === "PUBLISHED") return reply.code(409).send({ error: "already published" });
      await db.prediction.update({
        where: { id: p.id },
        data: { status: "REJECTED", humanDecision: "reject", reviewReason: req.body.reason, reviewerWallet: req.wallet!, reviewedAt: deps.now() },
      });
      const subs = await db.submission.findMany({ where: { predictionId: p.id }, select: { id: true } });
      await db.submission.updateMany({ where: { predictionId: p.id }, data: { status: "REJECTED", reason: req.body.reason } });
      for (const s of subs) await deps.enqueue("notify.fanout", { kind: "submission.updated", submissionId: s.id });
      await audit(req.wallet!, "prediction.reject", p.id, { reason: req.body.reason });
      return { ok: true };
    },
  );

  /** AI–human agreement per template — the gate for switching auto-publish on (plan B10a). */
  app.get("/agreement", async () => {
    const rows = await db.prediction.findMany({
      where: { humanDecision: { not: null }, aiDecision: { not: null } },
      select: { template: true, aiDecision: true, humanDecision: true, edited: true },
    });
    const out: Record<string, { n: number; agree: number; rate: number | null }> = {};
    for (const id of Object.keys(TEMPLATES)) {
      const relevant = rows.filter((r) => r.template === id);
      const agree = relevant.filter((r) =>
        r.aiDecision === "AUTO_PUBLISH" ? r.humanDecision === "approve" && !r.edited : r.humanDecision === "reject",
      ).length;
      out[id] = { n: relevant.length, agree, rate: relevant.length ? agree / relevant.length : null };
    }
    const enabled = ((await deps.kv.get(STATUS_KEYS.autoPublishTemplates)) ?? "").split(",").filter(Boolean);
    return { templates: out, enabled };
  });

  app.put(
    "/config/templates",
    { schema: { body: z.object({ enabled: z.array(z.enum(Object.keys(TEMPLATES) as [string, ...string[]])) }) } },
    async (req) => {
      await deps.kv.set(STATUS_KEYS.autoPublishTemplates, req.body.enabled.join(","));
      await audit(req.wallet!, "config.templates", null, { enabled: req.body.enabled });
      return { enabled: req.body.enabled };
    },
  );

  // ------------------------------------------------------------------ KOLs

  app.get("/kols", async () => {
    const kols = await db.kol.findMany({ orderBy: { xHandle: "asc" }, include: { stats: true } });
    return {
      kols: kols.map((k) => ({
        id: k.id,
        handle: k.xHandle,
        name: k.name,
        excluded: k.excluded,
        excludedReason: k.excludedReason,
        pollIntervalMin: k.pollIntervalMin,
        lastFetchedAt: k.lastFetchedAt?.toISOString() ?? null,
        live: k.stats?.live ?? 0,
      })),
    };
  });

  app.post(
    "/kols",
    {
      schema: {
        body: z.object({
          handle: z.string().trim().regex(/^@?[A-Za-z0-9_]{1,15}$/),
          name: z.string().trim().min(1).max(60),
          pollIntervalMin: z.number().int().min(5).max(24 * 60).default(30),
        }),
      },
    },
    async (req, reply) => {
      const handle = req.body.handle.replace(/^@/, "");
      const kol = await db.kol.upsert({
        where: { xHandle: handle },
        update: { name: req.body.name, pollIntervalMin: req.body.pollIntervalMin },
        create: { xHandle: handle, name: req.body.name, pollIntervalMin: req.body.pollIntervalMin },
      });
      await audit(req.wallet!, "kol.upsert", kol.id, { handle });
      return reply.code(201).send({ id: kol.id });
    },
  );

  app.patch(
    "/kols/:id",
    {
      schema: {
        params: z.object({ id: z.string().max(40) }),
        body: z.object({
          excluded: z.boolean().optional(),
          excludedReason: z.string().trim().max(300).nullable().optional(),
          pollIntervalMin: z.number().int().min(5).max(24 * 60).optional(),
        }),
      },
    },
    async (req) => {
      await db.kol.update({ where: { id: req.params.id }, data: req.body });
      await audit(req.wallet!, "kol.update", req.params.id, req.body as Prisma.InputJsonValue);
      return { ok: true };
    },
  );

  // ------------------------------------------------------------------ takedowns (development plan 6.5)

  app.get("/takedowns", async () => {
    const rows = await db.takedownRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return { takedowns: rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), handledAt: t.handledAt?.toISOString() ?? null })) };
  });

  app.post(
    "/takedowns/:id",
    { schema: { params: z.object({ id: z.string().max(40) }), body: z.object({ action: z.enum(["exclude", "reject"]) }) } },
    async (req, reply) => {
      const t = await db.takedownRequest.findUnique({ where: { id: req.params.id } });
      if (!t) return reply.code(404).send({ error: "not found" });
      if (req.body.action === "exclude") {
        // Create the KOL row if it isn't tracked yet, so web submissions for it are refused too.
        await db.kol.upsert({
          where: { xHandle: t.kolHandle },
          update: { excluded: true, excludedReason: `takedown ${t.id}` },
          create: { xHandle: t.kolHandle, name: t.kolHandle, excluded: true, excludedReason: `takedown ${t.id}` },
        });
      }
      await db.takedownRequest.update({
        where: { id: t.id },
        data: { status: req.body.action === "exclude" ? "EXCLUDED" : "REJECTED", handledBy: req.wallet!, handledAt: deps.now() },
      });
      await audit(req.wallet!, `takedown.${req.body.action}`, t.id, { kolHandle: t.kolHandle });
      return { ok: true };
    },
  );

  // ------------------------------------------------------------------ markets, resolutions, ops

  app.get("/markets", async () => {
    const now = deps.now();
    const rows = await db.market.findMany({
      include: { kol: true, resolution: true, _count: { select: { flags: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return { markets: rows.map((m) => ({ ...marketDto(m, now, { resolution: m.resolution }), flags: m._count.flags })) };
  });

  /** Markets that need resolver attention: past close, proposed or disputed. */
  app.get("/resolutions", async () => {
    const now = deps.now();
    const rows = await db.market.findMany({
      where: { OR: [{ status: { in: ["PROPOSED", "DISPUTED"] } }, { status: "OPEN", closeTime: { lte: now } }] },
      include: { kol: true, resolution: true },
      orderBy: { closeTime: "asc" },
    });
    return { markets: rows.map((m) => marketDto(m, now, { resolution: m.resolution })) };
  });

  /** Ask the resolver bot to propose an outcome by hand, e.g. INVALID when rules can't be applied fairly. */
  app.post(
    "/markets/:id/propose",
    {
      schema: {
        params: z.object({ id: z.string().max(40) }),
        body: z.object({ outcome: z.enum(["YES", "NO", "INVALID"]), note: z.string().trim().min(10).max(1000) }),
      },
    },
    async (req, reply) => {
      const m = await db.market.findUnique({ where: { id: req.params.id }, include: { resolution: true } });
      if (!m || m.onchainId === null) return reply.code(404).send({ error: "not an onchain market" });
      if (m.resolution) return reply.code(409).send({ error: "already proposed" });
      if (m.closeTime > deps.now()) return reply.code(409).send({ error: "trading has not closed yet" });
      await deps.enqueue("resolver.propose", { marketId: m.id, ...req.body }, { jobId: `propose:${m.id}` });
      await audit(req.wallet!, "market.propose", m.id, req.body);
      return { queued: true };
    },
  );

  app.get("/alerts", async () => {
    const rows = await db.systemAlert.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return { alerts: rows.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), resolvedAt: a.resolvedAt?.toISOString() ?? null })) };
  });

  app.post("/alerts/:id/resolve", { schema: { params: z.object({ id: z.string().max(40) }) } }, async (req) => {
    await db.systemAlert.update({ where: { id: req.params.id }, data: { resolvedAt: deps.now() } });
    return { ok: true };
  });

  app.get("/health", async () => {
    const [scraper, paused, reason, lastSuccess, indexerBlock, runs] = await Promise.all([
      deps.kv.get(STATUS_KEYS.scraperHealth),
      deps.kv.get(STATUS_KEYS.ingestPaused),
      deps.kv.get(STATUS_KEYS.ingestPausedReason),
      deps.kv.get(STATUS_KEYS.ingestLastSuccess),
      deps.kv.get(STATUS_KEYS.indexerBlock),
      db.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 50, include: { kol: { select: { xHandle: true } } } }),
    ]);
    return {
      scraper: scraper ? JSON.parse(scraper) : null,
      ingest: { paused: paused === "1", reason, lastSuccessAt: lastSuccess },
      indexer: { block: indexerBlock },
      runs: runs.map((r) => ({
        id: r.id,
        jobType: r.jobType,
        kol: r.kol?.xHandle ?? null,
        status: r.status,
        postsReturned: r.postsReturned,
        error: r.error,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      })),
    };
  });

  app.get("/audit", async () => {
    const rows = await db.adminAudit.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return { entries: rows.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) };
  });
};
