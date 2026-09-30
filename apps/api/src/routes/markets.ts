import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { Prisma } from "@stampd/db";
import { amount, marketDto, tradeDto } from "../lib/dto";
import { changes24h } from "../lib/queries";

const DAY_MS = 24 * 3600 * 1000;

const ListQuery = z.object({
  category: z.string().max(32).optional(),
  status: z.enum(["open", "closed", "resolved", "all"]).default("open"),
  sort: z.enum(["volume", "closing", "moves", "new", "trending"]).default("volume"),
  kol: z.string().max(32).optional(),
  feed: z.enum(["all", "following"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const marketRoutes: FastifyPluginAsyncZod = async (app) => {
  const { deps } = app;
  const { db } = deps;

  app.get("/markets", { schema: { querystring: ListQuery } }, async (req, reply) => {
    const q = req.query;
    const now = deps.now();
    const where: Prisma.MarketWhereInput = { status: { not: "PENDING" }, delistedAt: null };
    if (q.category) where.category = q.category;
    if (q.kol) where.kol = { xHandle: q.kol };
    if (q.status === "open") Object.assign(where, { status: "OPEN", closeTime: { gt: now } });
    if (q.status === "closed") where.OR = [{ status: { in: ["PROPOSED", "DISPUTED"] } }, { status: "OPEN", closeTime: { lte: now } }];
    if (q.status === "resolved") where.status = "RESOLVED";
    if (q.feed === "following") {
      if (!req.wallet) return reply.code(401).send({ error: "sign in required" });
      where.kol = { ...(where.kol as object), followers: { some: { userWallet: req.wallet } } };
    }

    // Sorts that need computed values rank a bounded candidate set in memory.
    const computed = q.sort === "moves" || q.sort === "trending";
    const orderBy: Prisma.MarketOrderByWithRelationInput =
      q.sort === "closing" ? { closeTime: "asc" } : q.sort === "new" ? { openedAt: "desc" } : { volume: "desc" };
    const rows = await db.market.findMany({
      where,
      include: { kol: true },
      orderBy,
      take: computed ? 500 : q.limit,
      skip: computed ? 0 : q.offset,
    });
    const changes = await changes24h(db, rows, now);

    let ordered = rows;
    if (q.sort === "moves") {
      ordered = [...rows].sort((a, b) => Math.abs(changes.get(b.id) ?? 0) - Math.abs(changes.get(a.id) ?? 0));
    } else if (q.sort === "trending") {
      const traders = await uniqueTraders24h(
        rows.map((r) => r.id),
        now,
      );
      ordered = [...rows].sort((a, b) => (traders.get(b.id) ?? 0) - (traders.get(a.id) ?? 0));
    }
    if (computed) ordered = ordered.slice(q.offset, q.offset + q.limit);

    const total = await db.market.count({ where });
    return {
      total,
      markets: ordered.map((m) => marketDto(m, now, { change24hBps: changes.get(m.id) ?? null })),
    };
  });

  /** Biggest 24h moves among open markets — the home page headline (development plan 1.6). */
  app.get(
    "/markets/moves",
    { schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(6) }) } },
    async (req) => {
      const now = deps.now();
      const rows = await db.market.findMany({
        where: { status: "OPEN", closeTime: { gt: now }, tradeCount: { gt: 0 }, delistedAt: null },
        include: { kol: true },
        orderBy: { volume: "desc" },
        take: 500,
      });
      const changes = await changes24h(db, rows, now);
      const moved = rows
        .filter((m) => (changes.get(m.id) ?? 0) !== 0)
        .sort((a, b) => Math.abs(changes.get(b.id)!) - Math.abs(changes.get(a.id)!))
        .slice(0, req.query.limit);
      return { markets: moved.map((m) => marketDto(m, now, { change24hBps: changes.get(m.id)! })) };
    },
  );

  app.get("/markets/:id", { schema: { params: z.object({ id: z.string().max(40) }) } }, async (req, reply) => {
    const now = deps.now();
    const m = await db.market.findUnique({
      where: { id: req.params.id },
      include: { kol: true, resolution: true, prediction: { include: { post: true } } },
    });
    if (!m || m.status === "PENDING" || m.delistedAt) return reply.code(404).send({ error: "market not found" });
    const changes = await changes24h(db, [m], now);

    let viewer = null;
    if (req.wallet) {
      const [watch, position] = await Promise.all([
        db.watch.findUnique({ where: { userWallet_marketId: { userWallet: req.wallet, marketId: m.id } } }),
        db.position.findUnique({ where: { wallet_marketId: { wallet: req.wallet, marketId: m.id } } }),
      ]);
      viewer = {
        watching: watch !== null,
        position: position
          ? {
              yesShares: amount(position.yesShares),
              noShares: amount(position.noShares),
              costBasis: amount(position.costBasis),
              redeemedAt: position.redeemedAt?.toISOString() ?? null,
              payout: amount(position.payout),
            }
          : null,
      };
    }
    const submitter = m.submittedBy
      ? await db.user.findUnique({ where: { wallet: m.submittedBy }, select: { wallet: true, displayName: true } })
      : null;
    const post = m.prediction?.post;
    return {
      market: marketDto(m, now, { change24hBps: changes.get(m.id) ?? null, resolution: m.resolution }),
      post:
        post && !post.deletedAt
          ? { text: post.text, postedAt: post.postedAt.toISOString(), url: post.url, authorHandle: post.authorHandle }
          : null,
      submitter,
      viewer,
    };
  });

  app.get(
    "/markets/:id/trades",
    {
      schema: {
        params: z.object({ id: z.string().max(40) }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          before: z.coerce.date().optional(),
        }),
      },
    },
    async (req) => {
      const trades = await db.trade.findMany({
        where: { marketId: req.params.id, ...(req.query.before ? { blockTime: { lt: req.query.before } } : {}) },
        orderBy: [{ blockTime: "desc" }, { logIndex: "desc" }],
        take: req.query.limit,
      });
      return { trades: trades.map(tradeDto) };
    },
  );

  app.get(
    "/markets/:id/prices",
    {
      schema: {
        params: z.object({ id: z.string().max(40) }),
        querystring: z.object({ range: z.enum(["1d", "1w", "1m", "all"]).default("all") }),
      },
    },
    async (req) => {
      const span = { "1d": DAY_MS, "1w": 7 * DAY_MS, "1m": 30 * DAY_MS, all: null }[req.query.range];
      const since = span ? new Date(deps.now().getTime() - span) : undefined;
      const points = await db.pricePoint.findMany({
        where: { marketId: req.params.id, ...(since ? { t: { gte: since } } : {}) },
        orderBy: { t: "asc" },
        take: 5_000,
        select: { t: true, yesPriceBps: true },
      });
      return { points: points.map((p) => ({ t: p.t.toISOString(), yesPriceBps: p.yesPriceBps })) };
    },
  );

  app.get("/markets/:id/holders", { schema: { params: z.object({ id: z.string().max(40) }) } }, async (req) => {
    const [yes, no] = await Promise.all(
      (["yesShares", "noShares"] as const).map((field) =>
        db.position.findMany({
          where: { marketId: req.params.id, [field]: { gt: 0 } },
          orderBy: { [field]: "desc" },
          take: 20,
        }),
      ),
    );
    return {
      yes: yes!.map((p) => ({ wallet: p.wallet, shares: amount(p.yesShares) })),
      no: no!.map((p) => ({ wallet: p.wallet, shares: amount(p.noShares) })),
    };
  });

  app.put(
    "/markets/:id/watch",
    { preHandler: app.requireWallet, schema: { params: z.object({ id: z.string().max(40) }) } },
    async (req) => {
      await db.watch.upsert({
        where: { userWallet_marketId: { userWallet: req.wallet!, marketId: req.params.id } },
        update: {},
        create: { userWallet: req.wallet!, marketId: req.params.id },
      });
      return { watching: true };
    },
  );

  app.delete(
    "/markets/:id/watch",
    { preHandler: app.requireWallet, schema: { params: z.object({ id: z.string().max(40) }) } },
    async (req) => {
      await db.watch.deleteMany({ where: { userWallet: req.wallet!, marketId: req.params.id } });
      return { watching: false };
    },
  );

  /** "Flag this market" (plan B10a step 4). One flag per wallet per market. */
  app.post(
    "/markets/:id/flag",
    {
      preHandler: app.requireWallet,
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      schema: {
        params: z.object({ id: z.string().max(40) }),
        body: z.object({ reason: z.string().trim().min(3).max(500) }),
      },
    },
    async (req) => {
      await db.marketFlag.upsert({
        where: { marketId_wallet: { marketId: req.params.id, wallet: req.wallet! } },
        update: { reason: req.body.reason },
        create: { marketId: req.params.id, wallet: req.wallet!, reason: req.body.reason },
      });
      return { ok: true };
    },
  );

  async function uniqueTraders24h(ids: string[], now: Date): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await db.$queryRaw<{ marketId: string; n: bigint }[]>`
      SELECT "marketId", COUNT(DISTINCT "wallet") AS n FROM "Trade"
      WHERE "marketId" = ANY(${ids}) AND "blockTime" > ${new Date(now.getTime() - DAY_MS)}
      GROUP BY "marketId"`;
    return new Map(rows.map((r) => [r.marketId, Number(r.n)]));
  }
};
