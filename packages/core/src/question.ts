import { keccak256, stringToBytes, type Hex } from "viem";

/**
 * The rules of a market. `questionHash = keccak256(canonicalJson(spec))` is stored onchain and the
 * JSON is pinned to IPFS, so anyone can check the rules were not edited after the fact (plan B5).
 */
export type MarketSpec = {
  version: 1;
  question: string;
  rules: string;
  category: string;
  kolHandle: string;
  kolSide: "YES" | "NO";
  sourcePostUrl: string;
  sourcePostId: string;
  /** ISO 8601, UTC */
  closeTime: string;
  resolveBy: string;
  resolution: {
    source: string; // allowlisted source key, e.g. "coinbase:BTC-USD:daily-close"
    url: string;
    subject: string;
    metric: string;
    comparator: ">=" | "<=" | ">" | "<";
    threshold: string; // decimal string, never a float
    /**
     * "any-close-before": YES if any daily close from market open up to closeTime meets the
     * condition. "close-on": only the last daily close at or before closeTime counts.
     */
    mode: "any-close-before" | "close-on";
  };
};

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** JSON with keys sorted at every level and no whitespace. Same input always gives the same bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value as Json));
}

function sortKeys(v: Json): Json {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(v).sort()) {
      const child = v[k];
      if (child !== undefined) out[k] = sortKeys(child);
    }
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error("canonicalJson: non-finite number");
  return v;
}

export function questionHash(spec: MarketSpec): Hex {
  return keccak256(stringToBytes(canonicalJson(spec)));
}
