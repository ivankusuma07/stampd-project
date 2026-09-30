import { describe, expect, it } from "vitest";
import { callEdge, twapBps, kolSideTwapBps, scoreKol, formatEdge, TWAP_WINDOW_SEC } from "../src/edge";

describe("callEdge (development plan 6.1)", () => {
  it("right at 30c -> +0.70", () => {
    expect(callEdge("YES", "YES", 3000)).toBeCloseTo(0.7, 10);
  });
  it("wrong at 70c -> -0.70", () => {
    expect(callEdge("NO", "YES", 7000)).toBeCloseTo(-0.7, 10);
  });
  it("right at 20c -> +0.80 and wrong at 80c -> -0.80 (plan B2)", () => {
    expect(callEdge("NO", "NO", 2000)).toBeCloseTo(0.8, 10);
    expect(callEdge("YES", "NO", 8000)).toBeCloseTo(-0.8, 10);
  });
  it("INVALID never counts", () => {
    expect(callEdge("INVALID", "YES", 3000)).toBeNull();
  });
});

describe("twapBps", () => {
  it("weights each price by how long it held", () => {
    const samples = [
      { t: 0, yesPriceBps: 5000 },
      { t: 60, yesPriceBps: 7000 },
    ];
    // 5000 for 60s, 7000 for 40s
    expect(twapBps(samples, 0, 100)).toBe(5800);
  });
  it("uses the last price before the window", () => {
    expect(twapBps([{ t: -10, yesPriceBps: 4000 }], 0, 100)).toBe(4000);
  });
  it("returns null without coverage", () => {
    expect(twapBps([{ t: 200, yesPriceBps: 4000 }], 0, 100)).toBeNull();
  });
});

describe("kolSideTwapBps", () => {
  const opened = 1_000;
  it("ignores the seeded opening price by starting at the first trade", () => {
    const samples = [
      { t: opened, yesPriceBps: 5000 }, // seed
      { t: opened + 3600, yesPriceBps: 3000 }, // first trade
    ];
    expect(kolSideTwapBps(samples, opened, opened + 3600, "YES")).toBe(3000);
    expect(kolSideTwapBps(samples, opened, opened + 3600, "NO")).toBe(7000);
  });
  it("is null with no trades in the first 24h", () => {
    expect(kolSideTwapBps([], opened, null, "YES")).toBeNull();
    expect(kolSideTwapBps([], opened, opened + TWAP_WINDOW_SEC, "YES")).toBeNull();
  });
});

describe("scoreKol", () => {
  it("computes hit rate and edge with n, excluding INVALID and thin markets", () => {
    const s = scoreKol([
      { result: "YES", kolSide: "YES", kolSidePriceBps: 3000, uniqueVerifiedTraders24h: 12 }, // +0.70
      { result: "NO", kolSide: "YES", kolSidePriceBps: 7000, uniqueVerifiedTraders24h: 40 }, // -0.70
      { result: "YES", kolSide: "YES", kolSidePriceBps: 5000, uniqueVerifiedTraders24h: 11 }, // +0.50
      { result: "YES", kolSide: "YES", kolSidePriceBps: 1000, uniqueVerifiedTraders24h: 3 }, // too thin
      { result: "INVALID", kolSide: "YES", kolSidePriceBps: 5000, uniqueVerifiedTraders24h: 50 },
    ]);
    expect(s.resolved).toBe(4);
    expect(s.correct).toBe(3);
    expect(s.invalid).toBe(1);
    expect(s.hitRate).toBe(0.75);
    expect(s.edgeN).toBe(3);
    expect(s.avgEdge).toBeCloseTo(0.5 / 3, 10);
    expect(formatEdge(s.avgEdge, s.edgeN)).toBe("+0.17 edge · 3 calls");
  });
  it("handles an empty record", () => {
    const s = scoreKol([]);
    expect(s.hitRate).toBeNull();
    expect(formatEdge(s.avgEdge, s.edgeN)).toBe("no edge yet · 0 calls");
  });
});
