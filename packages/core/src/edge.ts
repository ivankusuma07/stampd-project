/**
 * Edge score (plan file B2 #2, development plan 6.1).
 *
 *   edge = outcome − p
 *
 * `outcome` is 1 when the KOL was right and 0 when wrong; `p` is the crowd's price of the KOL's
 * side, as a time-weighted average over the first 24 hours of trading. Being right on a call the
 * crowd priced at 30¢ scores +0.70; being wrong on one priced at 70¢ scores −0.70.
 *
 * INVALID markets never count. A market counts only if at least `MIN_UNIQUE_TRADERS`
 * captcha-verified wallets traded it in its first 24 hours, so thin demo-money markets don't
 * distort scores (plan R12).
 */

export type Side = "YES" | "NO";
export type Result = "YES" | "NO" | "INVALID";

export const TWAP_WINDOW_SEC = 24 * 60 * 60;
export const MIN_UNIQUE_TRADERS = 10;

export type PriceSample = { t: number; yesPriceBps: number };

/**
 * Time-weighted average YES price (bps) of a step series over [from, to).
 * Each sample holds until the next one. Time before the first sample in range uses the last
 * sample before `from`; if there is none, that time is skipped. Returns null for no coverage.
 */
export function twapBps(samples: PriceSample[], from: number, to: number): number | null {
  if (to <= from) return null;
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  let weighted = 0;
  let covered = 0;
  let current: number | null = null;
  let cursor = from;

  for (const s of sorted) {
    if (s.t <= from) {
      current = s.yesPriceBps;
      continue;
    }
    if (s.t >= to) break;
    if (current !== null) {
      weighted += current * (s.t - cursor);
      covered += s.t - cursor;
    }
    cursor = s.t;
    current = s.yesPriceBps;
  }
  if (current !== null) {
    weighted += current * (to - cursor);
    covered += to - cursor;
  }
  return covered === 0 ? null : weighted / covered;
}

/**
 * The KOL-side price used as `p`. The window starts at the first trade, not at market creation,
 * so the seeded opening odds never count; it ends 24 hours after the market opened.
 */
export function kolSideTwapBps(
  samples: PriceSample[],
  openedAt: number,
  firstTradeAt: number | null,
  kolSide: Side,
): number | null {
  if (firstTradeAt === null) return null;
  const end = openedAt + TWAP_WINDOW_SEC;
  if (firstTradeAt >= end) return null;
  const yes = twapBps(samples, firstTradeAt, end);
  if (yes === null) return null;
  return kolSide === "YES" ? yes : 10_000 - yes;
}

/** Edge of one call, or null when it doesn't count (INVALID or no price). */
export function callEdge(result: Result, kolSide: Side, kolSidePriceBps: number | null): number | null {
  if (result === "INVALID" || kolSidePriceBps === null) return null;
  const right = result === kolSide ? 1 : 0;
  return right - kolSidePriceBps / 10_000;
}

export type ResolvedCall = {
  result: Result;
  kolSide: Side;
  kolSidePriceBps: number | null;
  uniqueVerifiedTraders24h: number;
};

export type KolScore = {
  /** markets resolved YES or NO */
  resolved: number;
  correct: number;
  invalid: number;
  /** correct / resolved, null when resolved = 0 */
  hitRate: number | null;
  /** mean edge over eligible calls, null when edgeN = 0 */
  avgEdge: number | null;
  edgeN: number;
};

export function isEdgeEligible(call: ResolvedCall, minTraders = MIN_UNIQUE_TRADERS): boolean {
  return (
    call.result !== "INVALID" && call.kolSidePriceBps !== null && call.uniqueVerifiedTraders24h >= minTraders
  );
}

export function scoreKol(calls: ResolvedCall[], minTraders = MIN_UNIQUE_TRADERS): KolScore {
  let resolved = 0;
  let correct = 0;
  let invalid = 0;
  let edgeSum = 0;
  let edgeN = 0;
  for (const c of calls) {
    if (c.result === "INVALID") {
      invalid++;
      continue;
    }
    resolved++;
    if (c.result === c.kolSide) correct++;
    if (isEdgeEligible(c, minTraders)) {
      edgeSum += callEdge(c.result, c.kolSide, c.kolSidePriceBps) as number;
      edgeN++;
    }
  }
  return {
    resolved,
    correct,
    invalid,
    hitRate: resolved === 0 ? null : correct / resolved,
    avgEdge: edgeN === 0 ? null : edgeSum / edgeN,
    edgeN,
  };
}

/** "+0.12 edge · 18 calls" */
export function formatEdge(avgEdge: number | null, n: number): string {
  if (avgEdge === null || n === 0) return "no edge yet · 0 calls";
  const sign = avgEdge > 0 ? "+" : avgEdge < 0 ? "−" : "±";
  return `${sign}${Math.abs(avgEdge).toFixed(2)} edge · ${n} call${n === 1 ? "" : "s"}`;
}
