/** Display helpers. Money is 6-decimal bigint everywhere; these are the only places it becomes text. */

export const USD_DECIMALS = 6;
const UNIT = 10n ** BigInt(USD_DECIMALS);

/** 5475 bps -> "55¢" (rounded to the nearest cent, never shows 0¢ or 100¢ for open prices). */
export function formatCents(bps: bigint | number): string {
  const v = Number(bps);
  const cents = Math.round(v / 100);
  if (v > 0 && cents === 0) return "<1¢";
  if (v < 10_000 && cents === 100) return ">99¢";
  return `${cents}¢`;
}

/** 5475 bps -> "54.8%" */
export function formatPercent(bps: bigint | number, digits = 1): string {
  return `${(Number(bps) / 100).toFixed(digits)}%`;
}

/** Signed change in cents: +15¢ / −3¢ / 0¢ */
export function formatCentsDelta(deltaBps: number): string {
  const cents = Math.round(deltaBps / 100);
  if (cents === 0) return "0¢";
  return `${cents > 0 ? "+" : "−"}${Math.abs(cents)}¢`;
}

/** 1234567890n -> "$1,234.57" */
export function formatUsd(amount: bigint, opts: { decimals?: number; compact?: boolean } = {}): string {
  const decimals = opts.decimals ?? 2;
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  if (opts.compact && abs >= 1_000n * UNIT) {
    const n = Number(abs / UNIT);
    const s = n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${(n / 1e3).toFixed(1)}K`;
    return `${negative ? "−" : ""}$${s.replace(".0", "")}`;
  }
  const scale = 10n ** BigInt(USD_DECIMALS - decimals);
  const rounded = (abs + scale / 2n) / scale; // round half up
  const whole = rounded / 10n ** BigInt(decimals);
  const frac = rounded % 10n ** BigInt(decimals);
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fracStr = decimals > 0 ? "." + frac.toString().padStart(decimals, "0") : "";
  return `${negative ? "−" : ""}$${wholeStr}${fracStr}`;
}

/** Shares have the same 6 decimals as collateral. 19090909n -> "19.09" */
export function formatShares(amount: bigint, decimals = 2): string {
  return formatUsd(amount, { decimals }).replace("$", "");
}

/** "12.5" -> 12500000n. Returns null for anything that isn't a plain non-negative decimal. */
export function parseUsd(input: string): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > USD_DECIMALS) return null;
  return BigInt(whole || "0") * UNIT + BigInt(frac.padEnd(USD_DECIMALS, "0") || "0");
}

/** 0x4b1e…9a0c */
export function shortHash(hash: string, head = 6, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** 72104388 -> "72,104,388" */
export function formatInt(n: number | bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Mar 2027" in UTC — market dates are always UTC. */
export function formatDateUtc(d: Date | string | number): string {
  const date = new Date(d);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "31 Mar 2027 · 00:00 UTC" */
export function formatDateTimeUtc(d: Date | string | number): string {
  const date = new Date(d);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${formatDateUtc(date)} · ${hh}:${mm} UTC`;
}

/** "3d 4h", "5h 12m", "12m", "closed" */
export function formatCountdown(to: Date | string | number, now: number = Date.now()): string {
  let s = Math.floor((new Date(to).getTime() - now) / 1000);
  if (s <= 0) return "closed";
  const d = Math.floor(s / 86_400);
  s -= d * 86_400;
  const h = Math.floor(s / 3_600);
  s -= h * 3_600;
  const m = Math.floor(s / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}
