import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { marketFactoryAbi, marketHubAbi, outcomeTokensAbi, resolverAbi, type Deployment } from "@stampd/chain";
import { startTestDb } from "@stampd/db/testing";
import type { PrismaClient } from "@stampd/db";
import { Indexer } from "../src/indexer/indexer";
import { reconcile, snapshotPrices } from "../src/indexer/maintenance";
import type { Effect } from "../src/indexer/project";
import { K, alice, anvilPath, bob, creator, deployStack, startAnvil, type Anvil } from "./chain";

const hasAnvil = anvilPath() !== null;
const USD = 1_000_000n;

describe.skipIf(!hasAnvil)("indexer against anvil", () => {
  let a: Anvil;
  let d: Deployment;
  let t: Awaited<ReturnType<typeof startTestDb>>;
  let db: PrismaClient;
  let effects: Effect[] = [];
  let indexer: Indexer;
  let marketRowId: string;
  let closeTime: bigint;

  const send = async (key: Hex, address: Hex, abi: readonly unknown[], functionName: string, args: unknown[]) => {
    const hash = await a.wallet(key).writeContract({ address, abi, functionName, args } as never);
    const r = await a.chain.waitForTransactionReceipt({ hash });
    expect(r.status).toBe("success");
    return r;
  };
  const buy = (key: Hex, id: bigint, outcome: number, amount: bigint) =>
    send(key, d.contracts.MarketHub, marketHubAbi, "buy", [id, outcome, amount, 0n, 2n ** 64n]);

  beforeAll(async () => {
    a = await startAnvil();
    d = await deployStack(a);
    t = await startTestDb();
    db = t.db as unknown as PrismaClient;
    indexer = new Indexer({
      db,
      chain: a.chain,
      deployment: d,
      confirmations: 0,
      batchBlocks: 50,
      onEffects: async (e) => void effects.push(...e),
    });

    // What the market.create job writes before sending the tx.
    const kol = await db.kol.create({ data: { xHandle: "example_kol", name: "Example" } });
    const now = BigInt((await a.chain.getBlock()).timestamp);
    closeTime = now + 7n * 86_400n;
    const questionHash = `0x${"ab".repeat(32)}` as Hex;
    const m = await db.market.create({
      data: {
        chainId: 31337,
        kolId: kol.id,
        question: "Will BTC close at or above $90,000 before the deadline?",
        rules: "rules",
        spec: {},
        questionHash,
        category: "crypto",
        sourcePostId: "1873000000000000000",
        sourcePostUrl: "https://x.com/example_kol/status/1873000000000000000",
        kolSide: "YES",
        closeTime: new Date(Number(closeTime) * 1000),
        resolveBy: new Date(Number(closeTime + 86_400n) * 1000),
        feeBps: 100,
        seedAmount: "0",
        openingYesPriceBps: 6000,
        yesPriceBps: 6000,
      },
    });
    marketRowId = m.id;

    await send(K.creator, d.contracts.MarketFactory, marketFactoryAbi, "createMarket", [
      questionHash,
      1873000000000000000n,
      closeTime,
      closeTime + 86_400n,
      100,
      300n * USD,
      6000,
    ]);
    await buy(K.alice, 1n, 1, 50n * USD); // alice YES
    await buy(K.bob, 1n, 0, 30n * USD); // bob NO
    await buy(K.alice, 1n, 1, 20n * USD); // alice YES again
    // alice sells some YES back
    await send(K.alice, d.contracts.MarketHub, marketHubAbi, "sell", [1n, 1, 10n * USD, 2n ** 128n, 2n ** 64n]);
    // alice gives bob 5 YES shares directly (ERC-1155 transfer)
    await send(K.alice, d.contracts.OutcomeTokens, outcomeTokensAbi, "safeTransferFrom", [
      alice.address,
      bob.address,
      3n,
      5n * USD,
      "0x",
    ]);
  }, 120_000);

  afterAll(async () => {
    a?.stop();
    await t?.stop();
  });

  async function projection() {
    const market = await db.market.findUniqueOrThrow({ where: { id: marketRowId } });
    const trades = await db.trade.findMany({ orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }] });
    const positions = await db.position.findMany({ orderBy: [{ wallet: "asc" }] });
    const prices = await db.pricePoint.findMany({ where: { source: { not: "snapshot" } }, orderBy: [{ t: "asc" }, { source: "asc" }] });
    const resolution = await db.resolution.findUnique({ where: { marketId: marketRowId } });
    const strip = <T extends object>(rows: T[]) => rows.map(({ id: _id, ...rest }: T & { id?: unknown }) => rest);
    const { updatedAt: _u, ...m } = market;
    return {
      market: m,
      trades: strip(trades),
      positions: positions.map(({ updatedAt: _p, ...rest }) => rest),
      prices: strip(prices),
      resolution,
    };
  }

  it("indexes markets, trades and transfers so the DB matches the chain", async () => {
    await indexer.runUntilHead();
    const m = await db.market.findUniqueOrThrow({ where: { id: marketRowId } });
    expect(m.onchainId).toBe(1n);
    expect(m.status).toBe("OPEN");
    expect(m.tradeCount).toBe(4);
    expect(effects).toContainEqual({ kind: "notify", event: "market.opened", marketId: marketRowId });
    expect(effects.filter((e) => e.kind === "alert")).toEqual([]);

    const onchain = await a.chain.readContract({ address: d.contracts.MarketHub, abi: marketHubAbi, functionName: "getMarket", args: [1n] });
    expect(m.yesReserve.toFixed(0)).toBe(onchain.yesReserve.toString());
    expect(m.noReserve.toFixed(0)).toBe(onchain.noReserve.toString());
    expect(m.collateral.toFixed(0)).toBe(onchain.collateral.toString());
    expect(m.fees.toFixed(0)).toBe(onchain.fees.toString());
    expect(m.yesPriceBps).toBe(
      Number(await a.chain.readContract({ address: d.contracts.MarketHub, abi: marketHubAbi, functionName: "priceYesBps", args: [1n] })),
    );

    // development plan 2.2: positions match onchain ERC-1155 balances
    for (const who of [alice, bob, creator] as const) {
      const p = await db.position.findUnique({ where: { wallet_marketId: { wallet: who.address.toLowerCase(), marketId: marketRowId } } });
      for (const [tokenId, field] of [
        [3n, "yesShares"],
        [2n, "noShares"],
      ] as const) {
        const bal = await a.chain.readContract({
          address: d.contracts.OutcomeTokens,
          abi: outcomeTokensAbi,
          functionName: "balanceOf",
          args: [who.address, tokenId],
        });
        expect(p?.[field].toFixed(0) ?? "0").toBe(bal.toString());
      }
    }
    expect(await reconcile(db, a.chain, d, async () => {})).toEqual([]);
    expect(await snapshotPrices(db, new Date())).toBe(1);
  });

  it("indexes proposal, finalization and redemption", async () => {
    await a.test.increaseTime({ seconds: 8 * 86_400 });
    await a.test.mine({ blocks: 1 });
    await send(K.resolverBot, d.contracts.Resolver, resolverAbi, "propose", [1n, 2, "data:application/json;base64,eyJvayI6dHJ1ZX0="]);
    await a.test.increaseTime({ seconds: 21_601 });
    await a.test.mine({ blocks: 1 });
    await send(K.bob, d.contracts.Resolver, resolverAbi, "finalize", [1n]);
    await send(K.alice, d.contracts.MarketHub, marketHubAbi, "redeem", [1n]);
    await indexer.runUntilHead();

    const m = await db.market.findUniqueOrThrow({ where: { id: marketRowId } });
    expect(m).toMatchObject({ status: "RESOLVED", result: "YES" });
    const r = await db.resolution.findUniqueOrThrow({ where: { marketId: marketRowId } });
    expect(r).toMatchObject({ proposedOutcome: "YES", finalOutcome: "YES", disputed: false, evidence: { ok: true } });
    const pos = await db.position.findUniqueOrThrow({ where: { wallet_marketId: { wallet: alice.address.toLowerCase(), marketId: marketRowId } } });
    expect(pos.redeemedAt).not.toBeNull();
    expect(pos.yesShares.toFixed(0)).toBe("0");
    expect(effects).toContainEqual({ kind: "notify", event: "market.resolved", marketId: marketRowId });
    expect(await reconcile(db, a.chain, d, async () => {})).toEqual([]);
  });

  it("backfill from the deploy block rebuilds identical rows (development plan 2.1)", async () => {
    const before = await projection();
    effects = [];
    await indexer.backfill();
    const after = await projection();
    expect(after).toEqual(before);
    expect(effects.filter((e) => e.kind === "notify")).toEqual([]); // no re-notifying on backfill
  });

  it("deleting a trade row makes reconciliation alert (development plan 2.3)", async () => {
    const alerts: string[] = [];
    const trade = await db.trade.findFirstOrThrow();
    await db.trade.delete({ where: { id: trade.id } });
    const mismatches = await reconcile(db, a.chain, d, async (kind) => void alerts.push(kind));
    expect(mismatches.map((x) => x.field)).toContain("tradeCount");
    expect(alerts).toEqual(["indexer.reconcile"]);
    await indexer.backfill(); // restore
  });

  it("detects a reorg and rewinds to the canonical chain", async () => {
    // a second market so a replaced block changes something visible
    const kol = await db.kol.findFirstOrThrow();
    const now = BigInt((await a.chain.getBlock()).timestamp);
    const hash2 = `0x${"cd".repeat(32)}` as Hex;
    const m2 = await db.market.create({
      data: {
        chainId: 31337, kolId: kol.id, question: "Second", rules: "r", spec: {}, questionHash: hash2, category: "crypto",
        sourcePostId: "2", sourcePostUrl: "u", kolSide: "YES", closeTime: new Date(), resolveBy: new Date(),
        feeBps: 0, seedAmount: "0", openingYesPriceBps: 5000, yesPriceBps: 5000,
      },
    });
    await send(K.creator, d.contracts.MarketFactory, marketFactoryAbi, "createMarket", [hash2, 2n, now + 86_400n, now + 90_000n, 0, 100n * USD, 5000]);
    await indexer.runUntilHead();

    const snap = await a.test.snapshot();
    await buy(K.alice, 2n, 1, 40n * USD); // alice buys YES — will be orphaned
    await indexer.runUntilHead();
    expect((await db.market.findUniqueOrThrow({ where: { id: m2.id } })).tradeCount).toBe(1);

    await a.test.revert({ id: snap });
    await buy(K.bob, 2n, 0, 10n * USD); // bob buys NO instead, at the same height
    await a.test.mine({ blocks: 1 });
    effects = [];
    await indexer.runUntilHead();

    expect(effects.some((e) => e.kind === "alert" && e.alert === "indexer.reorg")).toBe(true);
    const trades = await db.trade.findMany({ where: { marketId: m2.id } });
    expect(trades.map((x) => [x.wallet, x.outcome])).toEqual([[bob.address.toLowerCase(), "NO"]]);
    expect(await reconcile(db, a.chain, d, async () => {})).toEqual([]);
  });

  it("treats a failing RPC as a retry, never as a reorg (mainnet incident, 1 Oct 2026)", async () => {
    await indexer.runUntilHead();
    const before = { events: await db.chainEvent.count(), cursor: await db.indexerCursor.findFirstOrThrow() };
    expect(before.cursor.blockHash).not.toBe("");
    // a rate-limited RPC: every block lookup fails
    const flaky = new Proxy(a.chain, {
      get: (target, prop, recv) =>
        prop === "getBlock" ? async () => Promise.reject(new Error("429 Too Many Requests")) : Reflect.get(target, prop, recv),
    });
    const fragile = new Indexer({ db, chain: flaky, deployment: d, confirmations: 0, batchBlocks: 50, onEffects: async (e) => void effects.push(...e) });
    effects = [];
    await expect(fragile.tick()).rejects.toThrow(/429/);
    expect(effects.some((e) => e.kind === "alert" && e.alert === "indexer.reorg")).toBe(false);
    expect(await db.chainEvent.count()).toBe(before.events);
    expect((await db.indexerCursor.findFirstOrThrow()).blockNumber).toBe(before.cursor.blockNumber);
  });
});
