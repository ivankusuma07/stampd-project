import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { STATUS_KEYS } from "@stampd/queue";
import { marketDto } from "../lib/dto";

/** Callouts, takedown requests, search, insights and service status. */
export const socialRoutes: FastifyPluginAsyncZod = async (app) => {
  const { deps } = app;
  const { db } = deps;

  // ------------------------------------------------------------------ callouts

  app.get(
    "/callouts",
    {
      schema: {
        querystring: z.object({
          sort: z.enum(["latest", "trending"]).default("latest"),
          marketId: z.string().max(40).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        }),
      },
    },
    async (req) => {
      const now = deps.now();
      const trending = req.query.sort === "trending";
      const rows = await db.callout.findMany({
        where: {
          hidden: false,
          parentId: null,
          ...(req.query.marketId ? { marketId: req.query.marketId } : {}),
          ...(trending ? { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } } : {}),
        },
        orderBy: trending ? [{ likeCount: "desc" }, { createdAt: "desc" }] : { createdAt: "desc" },
        take: req.query.limit,
        include: {
          user: { select: { wallet: true, displayName: true } },
          market: { include: { kol: true } },
          replies: {
            where: { hidden: false },
            orderBy: { createdAt: "asc" },
            take: 20,
            include: { user: { select: { wallet: true, displayName: true } } },
          },
          ...(req.wallet ? { likes: { where: { wallet: req.wallet }, select: { wallet: true } } } : {}),
        },
      });
      return {
        callouts: rows.map((c) => ({
          id: c.id,
          side: c.side,
          text: c.text,
          likeCount: c.likeCount,
          liked: "likes" in c ? (c.likes as unknown[]).length > 0 : false,
          createdAt: c.createdAt.toISOString(),
          user: c.user,
          market: marketDto(c.market, now),
          replies: c.replies.map((r) => ({ id: r.id, text: r.text, side: r.side, user: r.user, createdAt: r.createdAt.toISOString() })),
        })),
      };
    },
  );

  app.post(
    "/callouts",
    {
      preHandler: app.requireWallet,
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      schema: {
        body: z.object({
          marketId: z.string().max(40),
          side: z.enum(["YES", "NO"]),
          text: z.string().trim().min(2).max(280),
          parentId: z.string().max(40).optional(),
        }),
      },
    },
    async (req, reply) => {
      const market = await db.market.findUnique({ where: { id: req.body.marketId }, select: { status: true } });
      if (!market || market.status === "PENDING") return reply.code(400).send({ error: "a callout must link to a market" });
      if (req.body.parentId) {
        const parent = await db.callout.findUnique({ where: { id: req.body.parentId } });
        if (!parent || parent.marketId !== req.body.marketId || parent.parentId) {
          return reply.code(400).send({ error: "bad parent" });
        }
      }
      const c = await db.callout.create({
        data: {
          userWallet: req.wallet!,
          marketId: req.body.marketId,
          side: req.body.side,
          text: req.body.text,
          parentId: req.body.parentId ?? null,
        },
      });
      return reply.code(201).send({ id: c.id });
    },
  );

  app.post(
    "/callouts/:id/like",
    {
      preHandler: app.requireWallet,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: { params: z.object({ id: z.string().max(40) }) },
    },
    async (req) => {
      const key = { calloutId_wallet: { calloutId: req.params.id, wallet: req.wallet! } };
      const existing = await db.calloutLike.findUnique({ where: key });
      if (existing) {
        await db.$transaction([
          db.calloutLike.delete({ where: key }),
          db.callout.update({ where: { id: req.params.id }, data: { likeCount: { decrement: 1 } } }),
        ]);
        return { liked: false };
      }
      await db.$transaction([
        db.calloutLike.create({ data: { calloutId: req.params.id, wallet: req.wallet! } }),
        db.callout.update({ where: { id: req.params.id }, data: { likeCount: { increment: 1 } } }),
      ]);
      return { liked: true };
    },
  );

  /** Three distinct reports hide a callout until an admin looks at it. */
  app.post(
    "/callouts/:id/report",
    {
      preHandler: app.requireWallet,
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: { params: z.object({ id: z.string().max(40) }), body: z.object({ reason: z.string().trim().min(3).max(300) }) },
    },
    async (req) => {
      await db.calloutReport.upsert({
        where: { calloutId_wallet: { calloutId: req.params.id, wallet: req.wallet! } },
        update: { reason: req.body.reason },
        create: { calloutId: req.params.id, wallet: req.wallet!, reason: req.body.reason },
      });
      const reports = await db.calloutReport.count({ where: { calloutId: req.params.id } });
      if (reports >= 3) await db.callout.update({ where: { id: req.params.id }, data: { hidden: true } });
      return { ok: true };
    },
  );

  // ------------------------------------------------------------------ takedown (plan R3)

  app.post(
    "/takedown",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
      schema: {
        body: z.object({
          kolHandle: z.string().trim().regex(/^@?[A-Za-z0-9_]{1,15}$/),
          name: z.string().trim().min(2).max(100),
          contact: z.string().trim().min(3).max(200),
          urls: z.string().trim().max(2000).default(""),
          reason: z.string().trim().min(10).max(3000),
        }),
      },
    },
    async (req, reply) => {
      const t = await db.takedownRequest.create({ data: { ...req.body, kolHandle: req.body.kolHandle.replace(/^@/, "") } });
      return reply.code(201).send({ id: t.id });
    },
  );

  // ------------------------------------------------------------------ search

  app.get("/search", { schema: { querystring: z.object({ q: z.string().trim().min(1).max(80) }) } }, async (req) => {
    const now = deps.now();
    const q = req.query.q.replace(/^@/, "");
    const [markets, kols] = await Promise.all([
      db.market.findMany({
        where: { status: { not: "PENDING" }, delistedAt: null, question: { contains: q, mode: "insensitive" } },
        include: { kol: true },
        orderBy: { volume: "desc" },
        take: 8,
      }),
      db.kol.findMany({
        where: {
          excluded: false,
          OR: [{ xHandle: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
        },
        take: 8,
      }),
    ]);
    return {
      markets: markets.map((m) => marketDto(m, now)),
      kols: kols.map((k) => ({ id: k.id, handle: k.xHandle, name: k.name, avatarUrl: k.avatarUrl })),
    };
  });

  // ------------------------------------------------------------------ insights (development plan 6.6)

  app.get("/insights", async () => {
    const [byStatus, byResult, byCategory, trades, traders, kols] = await Promise.all([
      db.market.groupBy({ by: ["status"], where: { status: { not: "PENDING" } }, _count: true }),
      db.market.groupBy({ by: ["result"], where: { status: "RESOLVED" }, _count: true }),
      db.market.groupBy({ by: ["category"], where: { status: { not: "PENDING" } }, _count: true }),
      db.trade.count(),
      db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT "wallet") AS n FROM "Trade"`,
      db.kol.count({ where: { excluded: false } }),
    ]);
    const count = (rows: { _count: number }[]) => rows.reduce((s, r) => s + r._count, 0);
    return {
      markets: count(byStatus),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      resolved: count(byResult),
      results: {
        YES: byResult.find((r) => r.result === "YES")?._count ?? 0,
        NO: byResult.find((r) => r.result === "NO")?._count ?? 0,
        INVALID: byResult.find((r) => r.result === "INVALID")?._count ?? 0,
      },
      byCategory: byCategory
        .map((r) => ({ category: r.category, markets: r._count }))
        .sort((a, b) => b.markets - a.markets),
      trades,
      traders: Number(traders[0]?.n ?? 0),
      trackedKols: kols,
    };
  });

  // ------------------------------------------------------------------ status

  /** Drives the "new markets paused" banner (plan B6b) and the header block number. */
  app.get("/status", async () => {
    const [paused, reason, lastSuccess, indexerBlock] = await Promise.all([
      deps.kv.get(STATUS_KEYS.ingestPaused),
      deps.kv.get(STATUS_KEYS.ingestPausedReason),
      deps.kv.get(STATUS_KEYS.ingestLastSuccess),
      deps.kv.get(STATUS_KEYS.indexerBlock),
    ]);
    return {
      chainId: deps.env.CHAIN_ID,
      ingest: { paused: paused === "1", reason, lastSuccessAt: lastSuccess },
      indexer: { block: indexerBlock },
    };
  });
};
