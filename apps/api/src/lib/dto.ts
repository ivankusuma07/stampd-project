import type { Kol, KolStats, Market, Prisma, Resolution, Trade } from "@stampd/db";

/** Money and share amounts travel as decimal strings of raw 6-decimal units (never JS numbers). */
export function amount(v: Prisma.Decimal | bigint | null | undefined): string | null {
  return v === null || v === undefined ? null : v.toString();
}

export function kolDto(k: Kol, stats?: KolStats | null) {
  return {
    id: k.id,
    handle: k.xHandle,
    name: k.name,
    avatarUrl: k.avatarUrl,
    stats: stats
      ? {
          live: stats.live,
          resolved: stats.resolved,
          correct: stats.correct,
          invalid: stats.invalid,
          hitRate: stats.hitRate,
          avgEdge: stats.avgEdge,
          edgeN: stats.edgeN,
        }
      : null,
  };
}

/** OPEN markets past their close time are shown as CLOSED until a proposal is indexed. */
export function displayStatus(m: Pick<Market, "status" | "closeTime">, now: Date) {
  return m.status === "OPEN" && m.closeTime <= now ? "CLOSED" : m.status;
}

export type MarketDtoExtra = { change24hBps?: number | null; resolution?: Resolution | null };

export function marketDto(m: Market & { kol: Kol }, now: Date, extra: MarketDtoExtra = {}) {
  return {
    id: m.id,
    onchainId: m.onchainId?.toString() ?? null,
    chainId: m.chainId,
    question: m.question,
    rules: m.rules,
    category: m.category,
    kol: { id: m.kol.id, handle: m.kol.xHandle, name: m.kol.name, avatarUrl: m.kol.avatarUrl },
    kolSide: m.kolSide,
    status: displayStatus(m, now),
    result: m.result,
    paused: m.paused,
    yesPriceBps: m.yesPriceBps,
    openingYesPriceBps: m.openingYesPriceBps,
    change24hBps: extra.change24hBps ?? null,
    feeBps: m.feeBps,
    pool: { yesReserve: amount(m.yesReserve), noReserve: amount(m.noReserve) },
    volume: amount(m.volume),
    tradeCount: m.tradeCount,
    closeTime: m.closeTime.toISOString(),
    resolveBy: m.resolveBy.toISOString(),
    sourcePostId: m.sourcePostId,
    sourcePostUrl: m.sourcePostUrl,
    questionHash: m.questionHash,
    specUri: m.specUri,
    spec: m.spec,
    submittedBy: m.submittedBy,
    createTxHash: m.createTxHash,
    openedAt: m.openedAt?.toISOString() ?? null,
    openedBlock: m.openedBlock?.toString() ?? null,
    settledAt: m.settledAt?.toISOString() ?? null,
    settledTxHash: m.settledTxHash,
    kolSideTwap24hBps: m.kolSideTwap24hBps,
    resolution: extra.resolution
      ? {
          proposedOutcome: extra.resolution.proposedOutcome,
          proposer: extra.resolution.proposer,
          evidenceUri: extra.resolution.evidenceUri,
          evidence: extra.resolution.evidence,
          disputeEnds: extra.resolution.disputeEnds.toISOString(),
          disputed: extra.resolution.disputed,
          disputer: extra.resolution.disputer,
          finalOutcome: extra.resolution.finalOutcome,
          proposedTxHash: extra.resolution.proposedTxHash,
          finalizedAt: extra.resolution.finalizedAt?.toISOString() ?? null,
          finalizedTxHash: extra.resolution.finalizedTxHash,
        }
      : null,
  };
}
export type MarketDto = ReturnType<typeof marketDto>;

export function tradeDto(t: Trade) {
  return {
    txHash: t.txHash,
    logIndex: t.logIndex,
    wallet: t.wallet,
    outcome: t.outcome,
    isBuy: t.isBuy,
    collateral: amount(t.collateral),
    shares: amount(t.shares),
    fee: amount(t.fee),
    priceAfterBps: t.priceAfterBps,
    blockNumber: t.blockNumber.toString(),
    blockTime: t.blockTime.toISOString(),
  };
}
