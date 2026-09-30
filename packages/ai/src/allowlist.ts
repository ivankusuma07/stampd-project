/**
 * Resolution sources the resolver bot can read (plan B4 "Resolution data", R9, R10).
 * Every market names one of these ids; anything else goes to human review.
 * Before launch, check each API's commercial-use terms (plan B12 V6).
 */
export type ResolutionSource = {
  id: string;
  name: string;
  metric: "daily close";
  /** subject -> the source's own symbol */
  assets: Record<string, string>;
  docsUrl: string;
};

/** Majors with deep liquidity only — no low-cap tokens in v1 (plan R10). */
const MAJORS = ["BTC", "ETH", "SOL", "LTC", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "BNB"] as const;

export const RESOLUTION_SOURCES: Record<string, ResolutionSource> = {
  "coinbase-daily-close": {
    id: "coinbase-daily-close",
    name: "Coinbase Exchange daily candle close (00:00 UTC)",
    metric: "daily close",
    assets: Object.fromEntries(MAJORS.filter((a) => a !== "BNB").map((a) => [a, `${a}-USD`])),
    docsUrl: "https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles",
  },
  "binance-daily-close": {
    id: "binance-daily-close",
    name: "Binance spot 1d kline close vs USDT (00:00 UTC)",
    metric: "daily close",
    assets: Object.fromEntries(MAJORS.map((a) => [a, `${a}USDT`])),
    docsUrl: "https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints",
  },
};

export function sourceFor(id: string): ResolutionSource | undefined {
  return RESOLUTION_SOURCES[id];
}

/** Text block listing the sources, given to the extractor so it picks a valid id. */
export function describeSources(): string {
  return Object.values(RESOLUTION_SOURCES)
    .map((s) => `- ${s.id}: ${s.name}. Assets: ${Object.keys(s.assets).join(", ")}.`)
    .join("\n");
}

/**
 * Auto-publish templates (plan B10a). All start disabled; enable one at a time once AI–human
 * agreement is ≥ 95% on ≥ 100 cases for that template.
 */
export const TEMPLATES = {
  "crypto-major-daily-close": {
    description: 'Will <MAJOR> close ≥/≤ $X on <allowlisted exchange> (UTC) before <date>?',
  },
} as const;
export type TemplateId = keyof typeof TEMPLATES;
