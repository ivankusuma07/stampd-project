import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buy,
  sell,
  seedReserves,
  priceYesBps,
  quoteBuy,
  quoteSell,
  maxSellForShares,
  minOutWithSlippage,
  maxInWithSlippage,
  FpmmError,
  YES,
  NO,
  type Pool,
} from "../src/fpmm";

const USD = 1_000_000n;

describe("Solidity parity (development plan 1.7)", () => {
  // Written by `forge test --match-contract QuoteVectors` from the Solidity library itself.
  const csv = readFileSync(join(__dirname, "vectors", "quotes.csv"), "utf8").trim().split(/\r?\n/);
  const rows = csv.slice(1).map((line) => {
    const [kind, ...nums] = line.split(",");
    const [sideR, otherR, amount, feeBps, shares, fee, newSideR, newOtherR] = nums.map(BigInt) as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ];
    return { kind, sideR, otherR, amount, feeBps, shares, fee, newSideR, newOtherR };
  });

  it("has 1,000 buy and 1,000 sell vectors", () => {
    expect(rows.filter((r) => r.kind === "buy")).toHaveLength(1000);
    expect(rows.filter((r) => r.kind === "sell")).toHaveLength(1000);
  });

  it("matches every vector to the unit", () => {
    for (const r of rows) {
      const fn = r.kind === "buy" ? buy : sell;
      const got = fn(r.sideR, r.otherR, r.amount, r.feeBps);
      expect(got).toEqual({ shares: r.shares, fee: r.fee, newSideR: r.newSideR, newOtherR: r.newOtherR });
    }
  });
});

describe("worked example (plan B5)", () => {
  it("y = n = 100, buy YES with 10 -> 19.090909 YES", () => {
    const pool: Pool = { yesReserve: 100n * USD, noReserve: 100n * USD, feeBps: 0n };
    const q = quoteBuy(pool, YES, 10n * USD);
    expect(q.shares).toBe(19_090_909n);
    expect(q.pool.yesReserve).toBe(90_909_091n);
    expect(q.priceBeforeBps).toBe(5000n);
    expect(q.priceAfterBps).toBe(5475n);
    expect(q.avgPriceBps).toBe(5238n); // 52.4c
  });

  it("buying NO mirrors buying YES", () => {
    const pool: Pool = { yesReserve: 100n * USD, noReserve: 100n * USD, feeBps: 0n };
    const q = quoteBuy(pool, NO, 10n * USD);
    expect(q.shares).toBe(19_090_909n);
    expect(q.sidePriceAfterBps).toBe(10_000n - 4524n);
  });
});

describe("seeding", () => {
  it("opens at 60c with the YES surplus removed", () => {
    const r = seedReserves(300n * USD, 6000n);
    expect(r).toEqual({ yesReserve: 200n * USD, noReserve: 300n * USD });
    expect(priceYesBps(r.yesReserve, r.noReserve)).toBe(6000n);
  });

  it("rejects prices outside 1c..99c", () => {
    expect(() => seedReserves(USD, 99n)).toThrow(FpmmError);
    expect(() => seedReserves(USD, 9901n)).toThrow(FpmmError);
  });
});

describe("sell helpers", () => {
  const pool: Pool = { yesReserve: 80n * USD, noReserve: 125n * USD, feeBps: 100n };

  it("sell rejects draining the pool", () => {
    expect(() => quoteSell(pool, YES, 125n * USD)).toThrow("InsufficientLiquidity");
  });

  it("maxSellForShares is the largest affordable amount", () => {
    const shares = 30n * USD;
    const out = maxSellForShares(pool, YES, shares);
    expect(quoteSell(pool, YES, out).shares).toBeLessThanOrEqual(shares);
    expect(quoteSell(pool, YES, out + 1n).shares).toBeGreaterThan(shares);
  });

  it("maxSellForShares is 0 for no shares", () => {
    expect(maxSellForShares(pool, YES, 0n)).toBe(0n);
  });

  it("round trip never profits", () => {
    const p0: Pool = { yesReserve: 100n * USD, noReserve: 100n * USD, feeBps: 0n };
    const b = quoteBuy(p0, YES, 10n * USD);
    const back = maxSellForShares(b.pool, YES, b.shares);
    expect(back).toBeLessThanOrEqual(10n * USD);
  });
});

describe("slippage", () => {
  it("rounds min out down and max in up", () => {
    expect(minOutWithSlippage(19_090_909n, 50n)).toBe(18_995_454n);
    expect(maxInWithSlippage(10_000_001n, 50n)).toBe(10_050_002n);
  });
});
