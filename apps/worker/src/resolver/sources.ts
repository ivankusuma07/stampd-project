import type { MarketSpec } from "@stampd/core";
import { RESOLUTION_SOURCES } from "@stampd/ai";

/**
 * Resolution data adapters (development plan 5.1). Each returns UTC daily closes as decimal
 * strings — never floats — plus the URL it read, which goes into the evidence.
 */
export type DailyClose = { day: string; start: number; close: string };
export type SourceRead = { closes: DailyClose[]; sourceUrl: string };
export type SourceAdapter = (symbol: string, fromDay: Date, toDay: Date, fetcher?: typeof fetch) => Promise<SourceRead>;

const DAY = 86_400;
const dayKey = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
export const startOfUtcDay = (d: Date) => Math.floor(d.getTime() / 1000 / DAY) * DAY;

/** Coinbase Exchange candles: [time, low, high, open, close, volume], max 300 per call, newest first. */
export const coinbaseDailyClose: SourceAdapter = async (symbol, fromDay, toDay, fetcher = fetch) => {
  const closes: DailyClose[] = [];
  const first = startOfUtcDay(fromDay);
  const last = startOfUtcDay(toDay);
  let url = "";
  for (let start = first; start <= last; start += 300 * DAY) {
    const end = Math.min(start + 299 * DAY, last);
    url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles?granularity=86400&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`;
    const res = await fetcher(url, { headers: { "User-Agent": "stampd-resolver" } });
    if (!res.ok) throw new Error(`coinbase ${res.status}`);
    const rows = (await res.json()) as [number, number, number, number, number, number][];
    // Candle JSON carries numbers; keep the text form of each close to avoid float rounding.
    for (const r of rows) closes.push({ day: dayKey(r[0]), start: r[0], close: String(r[4]) });
  }
  return { closes: dedupe(closes), sourceUrl: url };
};

/** Binance spot klines: [openTime(ms), open, high, low, close, ...] with prices as strings. */
export const binanceDailyClose: SourceAdapter = async (symbol, fromDay, toDay, fetcher = fetch) => {
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&startTime=${startOfUtcDay(fromDay) * 1000}&endTime=${(startOfUtcDay(toDay) + DAY) * 1000 - 1}&limit=1000`;
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as [number, string, string, string, string][];
  return {
    closes: dedupe(rows.map((r) => ({ day: dayKey(r[0] / 1000), start: r[0] / 1000, close: r[4] }))),
    sourceUrl: url,
  };
};

export const ADAPTERS: Record<string, SourceAdapter> = {
  "coinbase-daily-close": coinbaseDailyClose,
  "binance-daily-close": binanceDailyClose,
};

function dedupe(rows: DailyClose[]): DailyClose[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  return [...map.values()].sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- evaluation

const SCALE = 10n ** 12n;
/** Decimal string -> fixed-point bigint (12 decimals). */
export function toFixed(v: string): bigint {
  const m = v.trim().match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!m) throw new Error(`not a decimal: ${v}`);
  if (m[3]) return toFixed(Number(v).toFixed(12)); // exponent form from JSON numbers
  const frac = (m[2] ?? "").slice(0, 12).padEnd(12, "0");
  return BigInt(m[1]!) * SCALE + BigInt(frac);
}

function compare(value: string, cmp: MarketSpec["resolution"]["comparator"], threshold: string): boolean {
  const a = toFixed(value);
  const b = toFixed(threshold);
  return cmp === ">=" ? a >= b : cmp === "<=" ? a <= b : cmp === ">" ? a > b : a < b;
}

export type Verdict = {
  outcome: "YES" | "NO";
  matched: DailyClose | null;
  considered: { from: string; to: string; days: number };
  lastClose: DailyClose;
};

/**
 * Apply a market's rules to daily closes. Days counted: from the market's opening day to the day
 * containing closeTime, inclusive. Throws if any day in that range is missing.
 */
export function evaluate(spec: MarketSpec, closes: DailyClose[], openedAt: Date, closeTime: Date): Verdict {
  const first = startOfUtcDay(openedAt);
  const last = startOfUtcDay(closeTime);
  const byDay = new Map(closes.map((c) => [c.start, c]));
  const window: DailyClose[] = [];
  for (let t = first; t <= last; t += DAY) {
    const c = byDay.get(t);
    if (!c) throw new Error(`missing daily close for ${dayKey(t)}`);
    window.push(c);
  }
  const { comparator, threshold, mode } = spec.resolution;
  const lastClose = window[window.length - 1]!;
  const matched =
    mode === "close-on"
      ? compare(lastClose.close, comparator, threshold)
        ? lastClose
        : null
      : (window.find((c) => compare(c.close, comparator, threshold)) ?? null);
  return {
    outcome: matched ? "YES" : "NO",
    matched,
    considered: { from: window[0]!.day, to: lastClose.day, days: window.length },
    lastClose,
  };
}

/** A daily candle is final once its UTC day has ended; allow a few minutes for the source. */
export function readyToResolve(closeTime: Date, now: Date, graceSec = 10 * 60): boolean {
  return now.getTime() / 1000 >= startOfUtcDay(closeTime) + DAY + graceSec;
}

export function symbolFor(spec: MarketSpec): string | null {
  return RESOLUTION_SOURCES[spec.resolution.source]?.assets[spec.resolution.subject] ?? null;
}
