import { buy as fpmmBuy, sell as fpmmSell, priceYesBps, RESULT_FROM_CHAIN } from "@stampd/core";
import type { Prisma } from "@stampd/db";
import { decodeDataUri } from "../lib/ipfs";
import type { EventArgs } from "./events";

/**
 * Projections: how each stored ChainEvent changes the read model. Applying the same ordered
 * event list to empty projection tables always yields the same rows, which is what makes
 * `indexer:backfill` and reorg rewinds safe (development plan 2.1).
 */

type Tx = Prisma.TransactionClient;

export type StoredEvent = {
  blockNumber: bigint;
  blockTime: Date;
  txHash: string;
  logIndex: number;
  name: string;
  marketId: bigint | null;
  args: EventArgs;
};

export type Effect =
  | { kind: "notify"; event: "market.opened" | "market.resolved"; marketId: string }
  | { kind: "stats"; kolId: string }
  | { kind: "alert"; alert: string; message: string; data?: Record<string, string> };

const ZERO = "0x0000000000000000000000000000000000000000";
const big = (d: Prisma.Decimal | null | undefined) => (d ? BigInt(d.toFixed(0)) : 0n);
const s = (a: EventArgs, k: string) => String(a[k]);
const n = (a: EventArgs, k: string) => BigInt(s(a, k));
const result = (a: EventArgs, k: string) => RESULT_FROM_CHAIN[Number(a[k])] ?? null;

/**
 * Link MarketCreated events to the PENDING rows the market.create job wrote, by questionHash.
 * Runs before the ordered pass because the hub's MarketOpened is emitted (and ordered) before
 * the factory's MarketCreated in the same transaction.
 */
export async function linkCreatedMarkets(tx: Tx, chainId: number, events: StoredEvent[], effects: Effect[]) {
  for (const e of events) {
    if (e.name !== "MarketCreated") continue;
    const hash = s(e.args, "questionHash").toLowerCase();
    const linked = await tx.market.updateMany({
      where: { questionHash: hash },
      data: { onchainId: n(e.args, "marketId"), chainId },
    });
    if (linked.count === 0) {
      effects.push({
        kind: "alert",
        alert: "indexer.unknown-market",
        message: `MarketCreated ${s(e.args, "marketId")} has no matching questionHash in the database`,
        data: { questionHash: hash, txHash: e.txHash },
      });
    }
  }
}

/**
 * Apply one event. `only` restricts a rebuild to some markets: batch transfers can span
 * markets, and ids outside the set must not be applied twice.
 */
export async function applyEvent(tx: Tx, e: StoredEvent, effects: Effect[], only?: Set<bigint>): Promise<void> {
  const a = e.args;
  if (e.name === "TransferSingle") return transfer(tx, s(a, "from"), s(a, "to"), [n(a, "id")], [n(a, "value")], only);
  if (e.name === "TransferBatch") {
    const ids = (a.ids as string[]).map(BigInt);
    return transfer(tx, s(a, "from"), s(a, "to"), ids, (a.values as string[]).map(BigInt), only);
  }
  if (e.marketId === null || (only && !only.has(e.marketId))) return;

  const market = await tx.market.findUnique({ where: { onchainId: e.marketId } });
  if (!market) return; // unknown market (already alerted by linkCreatedMarkets)

  switch (e.name) {
    case "MarketCreated": {
      const opening = Number(a.initialYesPriceBps);
      await tx.market.update({
        where: { id: market.id },
        data: {
          status: "OPEN",
          closeTime: new Date(Number(a.closeTime) * 1000),
          resolveBy: new Date(Number(a.resolveBy) * 1000),
          feeBps: Number(a.feeBps),
          seedAmount: s(a, "seedAmount"),
          openingYesPriceBps: opening,
          openedAt: e.blockTime,
          openedBlock: e.blockNumber,
          createTxHash: e.txHash,
        },
      });
      await tx.pricePoint.upsert({
        where: { marketId_t_source: { marketId: market.id, t: e.blockTime, source: "open" } },
        update: {},
        create: { marketId: market.id, t: e.blockTime, yesPriceBps: market.yesPriceBps || opening, source: "open" },
      });
      if (market.predictionId) {
        await tx.prediction.update({ where: { id: market.predictionId }, data: { status: "PUBLISHED", createError: null } });
      }
      effects.push({ kind: "notify", event: "market.opened", marketId: market.id });
      return;
    }

    case "MarketOpened": {
      const y = n(a, "yesReserve");
      const no = n(a, "noReserve");
      await tx.market.update({
        where: { id: market.id },
        data: {
          yesReserve: y.toString(),
          noReserve: no.toString(),
          collateral: s(a, "collateral"),
          yesPriceBps: Number(priceYesBps(y, no)),
        },
      });
      return;
    }

    case "Trade": {
      const outcome = Number(a.outcome) === 1 ? "YES" : "NO";
      const isBuy = a.isBuy === true || a.isBuy === "true";
      const collateral = n(a, "collateral");
      const shares = n(a, "shares");
      const fee = n(a, "fee");
      const trader = s(a, "trader").toLowerCase();

      // Recompute the pool with the contract's own math and check it against the event.
      const y = big(market.yesReserve);
      const no = big(market.noReserve);
      const [side, other] = outcome === "YES" ? [y, no] : [no, y];
      const q = isBuy ? fpmmBuy(side, other, collateral, BigInt(market.feeBps)) : fpmmSell(side, other, collateral, BigInt(market.feeBps));
      const [newY, newN] = outcome === "YES" ? [q.newSideR, q.newOtherR] : [q.newOtherR, q.newSideR];
      if (q.shares !== shares || q.fee !== fee || Number(priceYesBps(newY, newN)) !== Number(a.priceAfterBps)) {
        effects.push({
          kind: "alert",
          alert: "indexer.reserve-drift",
          message: `Trade in market ${e.marketId} does not match the FPMM replay`,
          data: { txHash: e.txHash, eventShares: shares.toString(), replayShares: q.shares.toString() },
        });
      }
      const collateralDelta = isBuy ? collateral - fee : -(collateral + fee);

      await tx.trade.create({
        data: {
          txHash: e.txHash,
          logIndex: e.logIndex,
          marketId: market.id,
          wallet: trader,
          outcome,
          isBuy,
          collateral: collateral.toString(),
          shares: shares.toString(),
          fee: fee.toString(),
          priceAfterBps: Number(a.priceAfterBps),
          blockNumber: e.blockNumber,
          blockTime: e.blockTime,
        },
      });
      await tx.market.update({
        where: { id: market.id },
        data: {
          yesReserve: newY.toString(),
          noReserve: newN.toString(),
          collateral: (big(market.collateral) + collateralDelta).toString(),
          fees: (big(market.fees) + fee).toString(),
          volume: (big(market.volume) + collateral).toString(),
          tradeCount: { increment: 1 },
          yesPriceBps: Number(a.priceAfterBps),
          firstTradeAt: market.firstTradeAt ?? e.blockTime,
        },
      });
      await tx.pricePoint.upsert({
        where: { marketId_t_source: { marketId: market.id, t: e.blockTime, source: "trade" } },
        update: { yesPriceBps: Number(a.priceAfterBps) },
        create: { marketId: market.id, t: e.blockTime, yesPriceBps: Number(a.priceAfterBps), source: "trade" },
      });
      const pos = await tx.position.findUnique({ where: { wallet_marketId: { wallet: trader, marketId: market.id } } });
      const cost = big(pos?.costBasis) + (isBuy ? collateral : -collateral);
      await tx.position.upsert({
        where: { wallet_marketId: { wallet: trader, marketId: market.id } },
        update: { costBasis: cost.toString() },
        create: { wallet: trader, marketId: market.id, costBasis: cost.toString() },
      });
      return;
    }

    case "Redeemed": {
      const user = s(a, "user").toLowerCase();
      const payout = n(a, "payout");
      const pos = await tx.position.findUnique({ where: { wallet_marketId: { wallet: user, marketId: market.id } } });
      await tx.position.upsert({
        where: { wallet_marketId: { wallet: user, marketId: market.id } },
        update: { redeemedAt: e.blockTime, payout: payout.toString(), realizedPnl: (payout - big(pos?.costBasis)).toString() },
        create: { wallet: user, marketId: market.id, redeemedAt: e.blockTime, payout: payout.toString(), realizedPnl: payout.toString() },
      });
      await tx.market.update({ where: { id: market.id }, data: { collateral: (big(market.collateral) - payout).toString() } });
      return;
    }

    case "MarketSettled": {
      await tx.market.update({
        where: { id: market.id },
        data: { status: "RESOLVED", result: result(a, "result"), settledAt: e.blockTime, settledTxHash: e.txHash },
      });
      effects.push({ kind: "notify", event: "market.resolved", marketId: market.id });
      effects.push({ kind: "stats", kolId: market.kolId });
      return;
    }

    case "MarketPaused":
      await tx.market.update({ where: { id: market.id }, data: { paused: a.paused === true || a.paused === "true" } });
      return;

    case "OutcomeProposed": {
      const uri = s(a, "evidenceURI");
      const data = {
        proposedOutcome: result(a, "outcome")!,
        proposer: s(a, "proposer").toLowerCase(),
        evidenceUri: uri,
        evidence: (decodeDataUri(uri) ?? undefined) as Prisma.InputJsonValue | undefined,
        disputeEnds: new Date(Number(a.disputeEnds) * 1000),
        disputed: false,
        disputer: null,
        finalOutcome: null,
        proposedTxHash: e.txHash,
        finalizedAt: null,
        finalizedTxHash: null,
      };
      await tx.resolution.upsert({ where: { marketId: market.id }, update: data, create: { marketId: market.id, ...data } });
      if (market.status !== "RESOLVED") await tx.market.update({ where: { id: market.id }, data: { status: "PROPOSED" } });
      return;
    }

    case "Disputed":
      await tx.resolution.update({
        where: { marketId: market.id },
        data: { disputed: true, disputer: s(a, "disputer").toLowerCase() },
      });
      if (market.status !== "RESOLVED") await tx.market.update({ where: { id: market.id }, data: { status: "DISPUTED" } });
      effects.push({
        kind: "alert",
        alert: "resolution.disputed",
        message: `Market "${market.question}" was disputed. Arbitrate it in /admin`,
        data: { marketId: market.id, txHash: e.txHash },
      });
      return;

    case "Resolved":
      await tx.resolution.updateMany({
        where: { marketId: market.id },
        data: { finalOutcome: result(a, "outcome"), finalizedAt: e.blockTime, finalizedTxHash: e.txHash },
      });
      return;

    case "Arbitrated":
      return; // outcome is carried by Resolved/MarketSettled; kept in ChainEvent for the record
  }
}

async function transfer(tx: Tx, from: string, to: string, ids: bigint[], values: bigint[], only?: Set<bigint>) {
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const value = values[i]!;
    if (only && !only.has(id >> 1n)) continue;
    const market = await tx.market.findUnique({ where: { onchainId: id >> 1n }, select: { id: true } });
    if (!market) continue;
    const field = (id & 1n) === 1n ? "yesShares" : "noShares";
    for (const [wallet, sign] of [
      [from, -1n],
      [to, 1n],
    ] as const) {
      if (wallet === ZERO) continue;
      const w = wallet.toLowerCase();
      const pos = await tx.position.findUnique({ where: { wallet_marketId: { wallet: w, marketId: market.id } } });
      const next = big(pos?.[field]) + sign * value;
      await tx.position.upsert({
        where: { wallet_marketId: { wallet: w, marketId: market.id } },
        update: { [field]: next.toString() },
        create: { wallet: w, marketId: market.id, [field]: next.toString() },
      });
    }
  }
}

/** Reset every chain-derived field of these markets and delete their derived rows. */
export async function resetMarkets(tx: Tx, marketRowIds: string[]) {
  if (marketRowIds.length === 0) return;
  const where = { marketId: { in: marketRowIds } };
  await tx.trade.deleteMany({ where });
  await tx.position.deleteMany({ where });
  await tx.resolution.deleteMany({ where });
  await tx.pricePoint.deleteMany({ where: { ...where, source: { in: ["trade", "open"] } } });
  await tx.market.updateMany({
    where: { id: { in: marketRowIds } },
    data: {
      onchainId: null,
      status: "PENDING",
      result: null,
      paused: false,
      yesReserve: "0",
      noReserve: "0",
      collateral: "0",
      fees: "0",
      volume: "0",
      tradeCount: 0,
      firstTradeAt: null,
      kolSideTwap24hBps: null,
      uniqueVerifiedTraders24h: 0,
      openedAt: null,
      openedBlock: null,
      settledAt: null,
      settledTxHash: null,
    },
  });
}
