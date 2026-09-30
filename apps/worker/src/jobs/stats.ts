import { kolSideTwapBps, scoreKol, TWAP_WINDOW_SEC, type ResolvedCall } from "@stampd/core";
import type { PrismaClient } from "@stampd/db";

const WINDOW_MS = TWAP_WINDOW_SEC * 1000;

/**
 * `stats.edge` (development plan 6.1): once a market is 24h old, store the KOL-side TWAP `p`
 * (from the first trade, so seeded odds don't count) and how many captcha-verified wallets
 * traded it in that window.
 */
export async function computeEdgeInputs(db: PrismaClient, now = new Date()): Promise<number> {
  const markets = await db.market.findMany({
    where: { openedAt: { lte: new Date(now.getTime() - WINDOW_MS) }, kolSideTwap24hBps: null },
    select: { id: true, openedAt: true, firstTradeAt: true, kolSide: true },
    take: 500,
  });
  let updated = 0;
  for (const m of markets) {
    const opened = m.openedAt!;
    const end = new Date(opened.getTime() + WINDOW_MS);
    const points = await db.pricePoint.findMany({
      where: { marketId: m.id, source: "trade", t: { lte: end } },
      orderBy: { t: "asc" },
      select: { t: true, yesPriceBps: true },
    });
    const twap = kolSideTwapBps(
      points.map((p) => ({ t: p.t.getTime() / 1000, yesPriceBps: p.yesPriceBps })),
      opened.getTime() / 1000,
      m.firstTradeAt ? m.firstTradeAt.getTime() / 1000 : null,
      m.kolSide,
    );
    const traders = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT t."wallet") AS n
      FROM "Trade" t JOIN "User" u ON u."wallet" = t."wallet"
      WHERE t."marketId" = ${m.id} AND t."blockTime" >= ${opened} AND t."blockTime" < ${end}
        AND u."captchaVerifiedAt" IS NOT NULL`;
    await db.market.update({
      where: { id: m.id },
      data: {
        // -1 marks "window passed with no trades" so the market isn't re-scanned forever
        kolSideTwap24hBps: twap === null ? -1 : Math.round(twap),
        uniqueVerifiedTraders24h: Number(traders[0]?.n ?? 0),
      },
    });
    updated++;
  }
  return updated;
}

/** `stats.kol`: hit rate and edge with n (plan B7 kol_stats), for one KOL or all. */
export async function computeKolStats(db: PrismaClient, kolId?: string, now = new Date()): Promise<number> {
  const kols = await db.kol.findMany({ where: kolId ? { id: kolId } : {}, select: { id: true } });
  for (const k of kols) {
    const [live, resolved] = await Promise.all([
      db.market.count({ where: { kolId: k.id, status: "OPEN", closeTime: { gt: now } } }),
      db.market.findMany({
        where: { kolId: k.id, status: "RESOLVED" },
        select: { result: true, kolSide: true, kolSideTwap24hBps: true, uniqueVerifiedTraders24h: true },
      }),
    ]);
    const calls: ResolvedCall[] = resolved.map((m) => ({
      result: m.result!,
      kolSide: m.kolSide,
      kolSidePriceBps: m.kolSideTwap24hBps === null || m.kolSideTwap24hBps < 0 ? null : m.kolSideTwap24hBps,
      uniqueVerifiedTraders24h: m.uniqueVerifiedTraders24h,
    }));
    const s = scoreKol(calls);
    const data = {
      live,
      resolved: s.resolved,
      correct: s.correct,
      invalid: s.invalid,
      hitRate: s.hitRate,
      avgEdge: s.avgEdge,
      edgeN: s.edgeN,
    };
    await db.kolStats.upsert({ where: { kolId: k.id }, update: data, create: { kolId: k.id, ...data } });
  }
  return kols.length;
}
