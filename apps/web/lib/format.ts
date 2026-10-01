import { formatUsd } from "@stampd/core";

/** "3m", "5h", "2d" — for activity lists. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** Decimal string of 6-dec units → "$1,234.57"; "—" when missing. */
export function usd(v: string | null | undefined, opts?: { compact?: boolean }): string {
  if (v === null || v === undefined) return "-";
  return formatUsd(BigInt(v), opts);
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function displayName(u: { wallet: string; displayName: string | null } | null): string {
  if (!u) return "";
  return u.displayName ?? shortAddress(u.wallet);
}

export const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  CLOSED: "Awaiting result",
  PROPOSED: "Result proposed",
  DISPUTED: "Disputed",
  RESOLVED: "Resolved",
  PENDING: "Pending",
};
