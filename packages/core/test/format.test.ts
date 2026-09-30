import { describe, expect, it } from "vitest";
import {
  formatCents,
  formatCentsDelta,
  formatUsd,
  parseUsd,
  shortHash,
  formatDateUtc,
  formatCountdown,
  formatShares,
} from "../src/format";
import { canonicalJson, questionHash, type MarketSpec } from "../src/question";
import { parsePostUrl } from "../src/types";

describe("format", () => {
  it("cents", () => {
    expect(formatCents(5475n)).toBe("55¢");
    expect(formatCents(30)).toBe("<1¢");
    expect(formatCents(9990)).toBe(">99¢");
    expect(formatCents(10_000)).toBe("100¢");
    expect(formatCentsDelta(1500)).toBe("+15¢");
    expect(formatCentsDelta(-320)).toBe("−3¢");
  });
  it("usd", () => {
    expect(formatUsd(1_234_567_890n)).toBe("$1,234.57");
    expect(formatUsd(0n)).toBe("$0.00");
    expect(formatUsd(2_500_000_000n, { compact: true })).toBe("$2.5K");
    expect(formatShares(19_090_909n)).toBe("19.09");
  });
  it("parseUsd", () => {
    expect(parseUsd("12.5")).toBe(12_500_000n);
    expect(parseUsd("1,000")).toBe(1_000_000_000n);
    expect(parseUsd(".5")).toBe(500_000n);
    expect(parseUsd("1.1234567")).toBeNull();
    expect(parseUsd("-1")).toBeNull();
    expect(parseUsd("abc")).toBeNull();
  });
  it("hash and dates", () => {
    expect(shortHash("0x4b1e00000000000000000000000000000000000000000000000000000000009a0c")).toBe(
      "0x4b1e…9a0c",
    );
    expect(formatDateUtc("2027-03-31T00:00:00Z")).toBe("31 Mar 2027");
    expect(formatCountdown(Date.UTC(2026, 0, 3, 5), Date.UTC(2026, 0, 1, 1))).toBe("2d 4h");
    expect(formatCountdown(0, 1000)).toBe("closed");
  });
});

describe("question hash", () => {
  const spec: MarketSpec = {
    version: 1,
    question: "Will BTC close at or above $90,000 on Coinbase before 31 Mar 2027?",
    rules: "Resolves YES if any Coinbase BTC-USD daily close (00:00 UTC) is >= 90000 before the deadline.",
    category: "crypto",
    kolHandle: "example_kol",
    kolSide: "YES",
    sourcePostUrl: "https://x.com/example_kol/status/1873000000000000000",
    sourcePostId: "1873000000000000000",
    closeTime: "2027-03-31T00:00:00.000Z",
    resolveBy: "2027-04-01T00:00:00.000Z",
    resolution: {
      source: "coinbase:BTC-USD:daily-close",
      url: "https://api.exchange.coinbase.com/products/BTC-USD/candles",
      subject: "BTC",
      metric: "daily close",
      comparator: ">=",
      threshold: "90000",
      mode: "any-close-before",
    },
  };

  it("is independent of key order", () => {
    const reordered = Object.fromEntries(Object.entries(spec).reverse()) as MarketSpec;
    expect(canonicalJson(reordered)).toBe(canonicalJson(spec));
    expect(questionHash(reordered)).toBe(questionHash(spec));
  });

  it("changes when the rules change", () => {
    expect(questionHash({ ...spec, rules: spec.rules + " " })).not.toBe(questionHash(spec));
  });
});

describe("parsePostUrl", () => {
  it("accepts x.com and twitter.com status links", () => {
    expect(parsePostUrl("https://x.com/elonmusk/status/1873000000000000000")).toEqual({
      handle: "elonmusk",
      id: "1873000000000000000",
    });
    expect(parsePostUrl("https://twitter.com/a_b/status/123?s=20")).toEqual({ handle: "a_b", id: "123" });
    expect(parsePostUrl("https://mobile.twitter.com/a/status/9/photo/1")).toEqual({ handle: "a", id: "9" });
  });
  it("rejects anything else", () => {
    expect(parsePostUrl("https://evil.com/a/status/1")).toBeNull();
    expect(parsePostUrl("https://x.com/a")).toBeNull();
    expect(parsePostUrl("not a url")).toBeNull();
    expect(parsePostUrl("https://x.com.evil.com/a/status/1")).toBeNull();
  });
});
