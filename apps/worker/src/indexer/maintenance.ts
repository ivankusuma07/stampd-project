import type { PublicClient } from "viem";
import { marketHubAbi, outcomeTokensAbi, type Deployment } from "@stampd/chain";
import type { PrismaClient } from "@stampd/db";
import type { Alerter } from "../lib/alerts";

const FIVE_MIN = 5 * 60 * 1000;

/** Price snapshot for every open market, every 5 minutes (development plan 2.2). Idempotent per slot. */
export async function snapshotPrices(db: PrismaClient, now: Date): Promise<number> {
  const t = new Date(Math.floor(now.getTime() / FIVE_MIN) * FIVE_MIN);
  const open = await db.market.findMany({
    where: { status: "OPEN", closeTime: { gt: now } },
    select: { id: true, yesPriceBps: true },
  });
  const { count } = await db.pricePoint.createMany({
    data: open.map((m) => ({ marketId: m.id, t, yesPriceBps: m.yesPriceBps, source: "snapshot" })),
    skipDuplicates: true,
  });
  return count;
}

export type Mismatch = { marketId: string; field: string; db: string; chain: string };

/**
 * Hourly reconciliation (development plan 2.3): onchain pool state, trade counts and outcome
 * token supply against the database. Any difference raises an admin alert.
 */
export async function reconcile(
  db: PrismaClient,
  chain: PublicClient,
  deployment: Deployment,
  alert: Alerter,
): Promise<Mismatch[]> {
  const markets = await db.market.findMany({
    where: { chainId: deployment.chainId, onchainId: { not: null } },
    include: { _count: { select: { trades: true } } },
  });
  const mismatches: Mismatch[] = [];
  for (const m of markets) {
    const id = m.onchainId!;
    const onchain = await chain.readContract({
      address: deployment.contracts.MarketHub,
      abi: marketHubAbi,
      functionName: "getMarket",
      args: [id],
    });
    const check = (field: string, dbValue: string, chainValue: string) => {
      if (dbValue !== chainValue) mismatches.push({ marketId: m.id, field, db: dbValue, chain: chainValue });
    };
    check("yesReserve", m.yesReserve.toFixed(0), onchain.yesReserve.toString());
    check("noReserve", m.noReserve.toFixed(0), onchain.noReserve.toString());
    check("collateral", m.collateral.toFixed(0), onchain.collateral.toString());
    check("fees", m.fees.toFixed(0), onchain.fees.toString());

    const events = await db.chainEvent.count({ where: { marketId: id, name: "Trade" } });
    check("tradeCount", String(m._count.trades), String(events));

    for (const [outcome, field] of [
      [1n, "yesShares"],
      [0n, "noShares"],
    ] as const) {
      const supply = await chain.readContract({
        address: deployment.contracts.OutcomeTokens,
        abi: outcomeTokensAbi,
        functionName: "totalSupply",
        args: [(id << 1n) | outcome],
      });
      const agg = await db.position.aggregate({ where: { marketId: m.id }, _sum: { [field]: true } });
      const sum = (agg._sum as Record<string, { toFixed(n: number): string } | null>)[field];
      check(`${field}Supply`, sum ? sum.toFixed(0) : "0", supply.toString());
    }
  }
  if (mismatches.length > 0) {
    await alert("indexer.reconcile", `${mismatches.length} mismatch(es) between chain and database`, {
      mismatches: mismatches.slice(0, 50),
    });
  }
  return mismatches;
}
