/**
 * Binary FPMM quote math. A line-by-line port of `packages/contracts/src/libraries/FpmmMath.sol`:
 * same formulas, same rounding (against the trader), bigint only. `test/fpmm.test.ts` replays
 * 2,000 quotes produced by the Solidity library and requires identical results.
 */

export const BPS = 10_000n;

export type Outcome = 0 | 1; // 0 = NO, 1 = YES
export const NO: Outcome = 0;
export const YES: Outcome = 1;

export class FpmmError extends Error {
  constructor(public readonly code: "EmptyPool" | "InsufficientLiquidity" | "BadPrice") {
    super(code);
    this.name = "FpmmError";
  }
}

function mulDivFloor(a: bigint, b: bigint, d: bigint): bigint {
  return (a * b) / d;
}

function mulDivCeil(a: bigint, b: bigint, d: bigint): bigint {
  const p = a * b;
  return p / d + (p % d === 0n ? 0n : 1n);
}

export function priceYesBps(yesReserve: bigint, noReserve: bigint): bigint {
  const total = yesReserve + noReserve;
  if (total === 0n) throw new FpmmError("EmptyPool");
  return (noReserve * BPS) / total;
}

export type RawQuote = { shares: bigint; fee: bigint; newSideR: bigint; newOtherR: bigint };

export function buy(buyR: bigint, otherR: bigint, amountIn: bigint, feeBps: bigint): RawQuote {
  if (buyR === 0n || otherR === 0n) throw new FpmmError("EmptyPool");
  const fee = mulDivCeil(amountIn, feeBps, BPS);
  const net = amountIn - fee;
  const newOtherR = otherR + net;
  const newSideR = mulDivCeil(buyR, otherR, newOtherR);
  return { shares: buyR + net - newSideR, fee, newSideR, newOtherR };
}

export function sell(sellR: bigint, otherR: bigint, amountOut: bigint, feeBps: bigint): RawQuote {
  if (sellR === 0n || otherR === 0n) throw new FpmmError("EmptyPool");
  const gross = mulDivCeil(amountOut, BPS, BPS - feeBps);
  if (gross >= otherR) throw new FpmmError("InsufficientLiquidity");
  const fee = gross - amountOut;
  const newOtherR = otherR - gross;
  const ending = mulDivCeil(sellR, otherR, newOtherR);
  return { shares: gross + ending - sellR, fee, newSideR: ending, newOtherR };
}

export function seedReserves(seed: bigint, yesPriceBps: bigint): { yesReserve: bigint; noReserve: bigint } {
  if (yesPriceBps < 100n || yesPriceBps > 9_900n) throw new FpmmError("BadPrice");
  let y: bigint;
  let n: bigint;
  if (yesPriceBps >= 5_000n) {
    n = seed;
    y = mulDivFloor(seed, BPS - yesPriceBps, yesPriceBps);
  } else {
    y = seed;
    n = mulDivFloor(seed, yesPriceBps, BPS - yesPriceBps);
  }
  if (y === 0n || n === 0n) throw new FpmmError("EmptyPool");
  return { yesReserve: y, noReserve: n };
}

// ------------------------------------------------------------------ market-level quotes

export type Pool = { yesReserve: bigint; noReserve: bigint; feeBps: bigint };

export type TradeQuote = {
  shares: bigint;
  fee: bigint;
  /** YES price before / after, in bps */
  priceBeforeBps: bigint;
  priceAfterBps: bigint;
  /** price of the traded outcome before / after, in bps */
  sidePriceBeforeBps: bigint;
  sidePriceAfterBps: bigint;
  /** collateral per share, in bps of 1.00 (0 when no shares) */
  avgPriceBps: bigint;
  pool: Pool;
};

function sides(pool: Pool, outcome: Outcome): [bigint, bigint] {
  return outcome === YES ? [pool.yesReserve, pool.noReserve] : [pool.noReserve, pool.yesReserve];
}

function withSides(pool: Pool, outcome: Outcome, sideR: bigint, otherR: bigint): Pool {
  return outcome === YES
    ? { ...pool, yesReserve: sideR, noReserve: otherR }
    : { ...pool, yesReserve: otherR, noReserve: sideR };
}

function sidePrice(yesBps: bigint, outcome: Outcome): bigint {
  return outcome === YES ? yesBps : BPS - yesBps;
}

function toQuote(pool: Pool, next: Pool, outcome: Outcome, raw: RawQuote, collateral: bigint): TradeQuote {
  const before = priceYesBps(pool.yesReserve, pool.noReserve);
  const after = priceYesBps(next.yesReserve, next.noReserve);
  return {
    shares: raw.shares,
    fee: raw.fee,
    priceBeforeBps: before,
    priceAfterBps: after,
    sidePriceBeforeBps: sidePrice(before, outcome),
    sidePriceAfterBps: sidePrice(after, outcome),
    avgPriceBps: raw.shares === 0n ? 0n : (collateral * BPS) / raw.shares,
    pool: next,
  };
}

/** Same result as `MarketHub.quoteBuy`. */
export function quoteBuy(pool: Pool, outcome: Outcome, amountIn: bigint): TradeQuote {
  const [s, o] = sides(pool, outcome);
  const raw = buy(s, o, amountIn, pool.feeBps);
  return toQuote(pool, withSides(pool, outcome, raw.newSideR, raw.newOtherR), outcome, raw, amountIn);
}

/** Same result as `MarketHub.quoteSell`: shares needed to receive exactly `amountOut`. */
export function quoteSell(pool: Pool, outcome: Outcome, amountOut: bigint): TradeQuote {
  const [s, o] = sides(pool, outcome);
  const raw = sell(s, o, amountOut, pool.feeBps);
  return toQuote(pool, withSides(pool, outcome, raw.newSideR, raw.newOtherR), outcome, raw, amountOut);
}

/**
 * Largest collateral amount a holder of `shares` can receive in one sell. The contract sells by
 * collateral out, so the UI uses this for "sell N shares" / "sell all". Binary search; the
 * shares needed grow monotonically with `amountOut`.
 */
export function maxSellForShares(pool: Pool, outcome: Outcome, shares: bigint): bigint {
  if (shares <= 0n) return 0n;
  const [, otherR] = sides(pool, outcome);
  // gross = ceil(out / (1 - fee)) must stay below otherR
  let hi = ((otherR - 1n) * (BPS - pool.feeBps)) / BPS;
  if (hi > shares) hi = shares; // one share never pays more than 1.00
  let lo = 0n;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    let ok = false;
    try {
      ok = quoteSell(pool, outcome, mid).shares <= shares;
    } catch {
      ok = false;
    }
    if (ok) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/** Minimum acceptable output after `slippageBps` of tolerance (rounded down). */
export function minOutWithSlippage(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (BPS - slippageBps)) / BPS;
}

/** Maximum acceptable input after `slippageBps` of tolerance (rounded up). */
export function maxInWithSlippage(amount: bigint, slippageBps: bigint): bigint {
  return mulDivCeil(amount, BPS + slippageBps, BPS);
}
