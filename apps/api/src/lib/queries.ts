import type { PrismaClient } from "@stampd/db";

/**
 * YES price 24h ago for each market: the last price point at or before `at`. Markets younger
 * than 24h use their first price point (so a new market's change is measured from opening).
 */
export async function pricesAt(db: PrismaClient, marketIds: string[], at: Date): Promise<Map<string, number>> {
  if (marketIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ marketId: string; yesPriceBps: number }[]>`
    SELECT DISTINCT ON ("marketId") "marketId", "yesPriceBps"
    FROM "PricePoint"
    WHERE "marketId" = ANY(${marketIds}) AND "t" <= ${at}
    ORDER BY "marketId", "t" DESC`;
  const map = new Map(rows.map((r) => [r.marketId, r.yesPriceBps]));
  const missing = marketIds.filter((id) => !map.has(id));
  if (missing.length > 0) {
    const first = await db.$queryRaw<{ marketId: string; yesPriceBps: number }[]>`
      SELECT DISTINCT ON ("marketId") "marketId", "yesPriceBps"
      FROM "PricePoint"
      WHERE "marketId" = ANY(${missing})
      ORDER BY "marketId", "t" ASC`;
    for (const r of first) map.set(r.marketId, r.yesPriceBps);
  }
  return map;
}

export async function changes24h(
  db: PrismaClient,
  markets: { id: string; yesPriceBps: number }[],
  now: Date,
): Promise<Map<string, number>> {
  const then = await pricesAt(
    db,
    markets.map((m) => m.id),
    new Date(now.getTime() - 24 * 3600 * 1000),
  );
  const out = new Map<string, number>();
  for (const m of markets) {
    const p = then.get(m.id);
    if (p !== undefined) out.set(m.id, m.yesPriceBps - p);
  }
  return out;
}
