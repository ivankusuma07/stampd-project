import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { kolDto, marketDto } from "../lib/dto";

/**
 * KOL directory and profiles. Hit rate and edge are always returned with their sample size
 * (plan B8); the web never shows a rate without n.
 */
export const kolRoutes: FastifyPluginAsyncZod = async (app) => {
  const { deps } = app;
  const { db } = deps;

  app.get(
    "/kols",
    {
      schema: {
        querystring: z.object({
          sort: z.enum(["live", "markets", "hitRate", "edge", "handle"]).default("live"),
          limit: z.coerce.number().int().min(1).max(200).default(100),
        }),
      },
    },
    async (req) => {
      const kols = await db.kol.findMany({
        where: { excluded: false },
        include: { stats: true, _count: { select: { markets: { where: { status: { not: "PENDING" } } } } } },
        take: 500,
      });
      const key = req.query.sort;
      const val = (k: (typeof kols)[number]): number => {
        const s = k.stats;
        if (key === "live") return s?.live ?? 0;
        if (key === "markets") return k._count.markets;
        if (key === "hitRate") return s?.hitRate ?? -1;
        if (key === "edge") return s?.edgeN ? (s.avgEdge ?? -2) : -2;
        return 0;
      };
      const sorted =
        key === "handle"
          ? [...kols].sort((a, b) => a.xHandle.localeCompare(b.xHandle))
          : [...kols].sort((a, b) => val(b) - val(a) || a.xHandle.localeCompare(b.xHandle));
      return {
        kols: sorted.slice(0, req.query.limit).map((k) => ({ ...kolDto(k, k.stats), markets: k._count.markets })),
      };
    },
  );

  app.get("/kols/:handle", { schema: { params: z.object({ handle: z.string().max(32) }) } }, async (req, reply) => {
    const now = deps.now();
    const kol = await db.kol.findUnique({
      where: { xHandle: req.params.handle },
      include: { stats: true, _count: { select: { followers: true } } },
    });
    if (!kol || kol.excluded) return reply.code(404).send({ error: "not found" });
    const markets = await db.market.findMany({
      where: { kolId: kol.id, status: { not: "PENDING" }, delistedAt: null },
      include: { kol: true, resolution: true },
      orderBy: { closeTime: "desc" },
      take: 200,
    });
    const following = req.wallet
      ? (await db.follow.findUnique({ where: { userWallet_kolId: { userWallet: req.wallet, kolId: kol.id } } })) !== null
      : false;
    return {
      kol: { ...kolDto(kol, kol.stats), followers: kol._count.followers },
      following,
      markets: markets.map((m) => marketDto(m, now, { resolution: m.resolution })),
    };
  });

  app.put(
    "/kols/:id/follow",
    { preHandler: app.requireWallet, schema: { params: z.object({ id: z.string().max(40) }) } },
    async (req) => {
      await db.follow.upsert({
        where: { userWallet_kolId: { userWallet: req.wallet!, kolId: req.params.id } },
        update: {},
        create: { userWallet: req.wallet!, kolId: req.params.id },
      });
      return { following: true };
    },
  );

  app.delete(
    "/kols/:id/follow",
    { preHandler: app.requireWallet, schema: { params: z.object({ id: z.string().max(40) }) } },
    async (req) => {
      await db.follow.deleteMany({ where: { userWallet: req.wallet!, kolId: req.params.id } });
      return { following: false };
    },
  );
};
