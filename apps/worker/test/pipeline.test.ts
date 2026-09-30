import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { demoUSDAbi, marketHubAbi, type Deployment } from "@stampd/chain";
import type { MarketSpec } from "@stampd/core";
import type { PrismaClient } from "@stampd/db";
import { startTestDb } from "@stampd/db/testing";
import { createMarket } from "../src/jobs/market";
import { Indexer } from "../src/indexer/indexer";
import { ResolverBot } from "../src/resolver/bot";
import type { DailyClose, SourceAdapter } from "../src/resolver/sources";
import { K, alice, anvilPath, deployStack, startAnvil, type Anvil } from "./chain";

const USD = 1_000_000n;
const DAY = 86_400;

describe.skipIf(anvilPath() === null)("pipeline: approve → create → index → resolve → redeem", () => {
  let a: Anvil;
  let d: Deployment;
  let t: Awaited<ReturnType<typeof startTestDb>>;
  let db: PrismaClient;
  let indexer: Indexer;
  const alerts: string[] = [];
  const alert = async (kind: string, message: string) => void alerts.push(`${kind}: ${message}`);
  const wallet = (key: Hex) =>
    createWalletClient({ chain: anvil, transport: http(a.url), account: privateKeyToAccount(key) });

  beforeAll(async () => {
    a = await startAnvil();
    d = await deployStack(a);
    t = await startTestDb();
    db = t.db as unknown as PrismaClient;
    indexer = new Indexer({ db, chain: a.chain, deployment: d, confirmations: 0, batchBlocks: 100 });
  }, 120_000);
  afterAll(async () => {
    a?.stop();
    await t?.stop();
  });

  async function approvedPrediction(n: number, threshold: string, closeTime: Date) {
    const kol = await db.kol.upsert({ where: { xHandle: "example_kol" }, update: {}, create: { xHandle: "example_kol", name: "E" } });
    const xPostId = `18730000000000001${n}`;
    const post = await db.post.create({
      data: { xPostId, kolId: kol.id, authorHandle: "example_kol", authorId: "42", text: "call", postedAt: new Date(), url: `https://x.com/example_kol/status/${xPostId}` },
    });
    const spec: MarketSpec = {
      version: 1,
      question: `Will BTC close at or above $${threshold}? (#${n})`,
      rules: "Any Coinbase daily close from open to deadline.",
      category: "crypto",
      kolHandle: "example_kol",
      kolSide: "YES",
      sourcePostUrl: post.url,
      sourcePostId: xPostId,
      closeTime: closeTime.toISOString(),
      resolveBy: new Date(closeTime.getTime() + DAY * 1000).toISOString(),
      resolution: { source: "coinbase-daily-close", url: "", subject: "BTC", metric: "daily close", comparator: ">=", threshold, mode: "any-close-before" },
    };
    return db.prediction.create({
      data: {
        postId: post.id,
        source: "TIMELINE",
        status: "APPROVED",
        spec: spec as object,
        seedAmount: (100n * USD).toString(),
        openingPriceBps: 5000,
        feeBps: 100,
      },
    });
  }

  it("resolves YES, NO and INVALID end to end and pays the winner", async () => {
    const chainNow = Number((await a.chain.getBlock()).timestamp);
    const closeTime = new Date((chainNow + 3 * DAY) * 1000);
    const creatorDeps = { db, chain: a.chain, wallet: wallet(K.creator), deployment: d, alert };

    const ids: string[] = [];
    for (const [n, threshold] of [
      [1, "90000"],
      [2, "150000"],
      [3, "90000"],
      [4, "90000"],
    ] as const) {
      const p = await approvedPrediction(n, threshold, closeTime);
      const { marketId, txHash } = await createMarket(creatorDeps, p.id);
      expect(txHash).toMatch(/^0x/);
      // retrying the job must not create a second market
      expect((await createMarket(creatorDeps, p.id)).marketId).toBe(marketId);
      ids.push(marketId);
    }
    await indexer.runUntilHead();
    const opened = await db.market.findMany({ where: { id: { in: ids } }, orderBy: { onchainId: "asc" } });
    expect(opened.map((m) => m.status)).toEqual(["OPEN", "OPEN", "OPEN", "OPEN"]);
    expect(opened.every((m) => m.specUri?.startsWith("data:application/json;base64,"))).toBe(true);
    expect((await db.prediction.findMany()).every((p) => p.status === "PUBLISHED")).toBe(true);

    // alice buys YES on market 1
    const m1 = opened[0]!.onchainId!;
    const buy = await wallet(K.alice).writeContract({ address: d.contracts.MarketHub, abi: marketHubAbi, functionName: "buy", args: [m1, 1, 20n * USD, 0n, 2n ** 64n] });
    await a.chain.waitForTransactionReceipt({ hash: buy });
    await indexer.runUntilHead();

    // past the deadline and the day's candle
    await a.test.increaseTime({ seconds: 4 * DAY + 3600 });
    await a.test.mine({ blocks: 1 });
    const now = new Date(Number((await a.chain.getBlock()).timestamp) * 1000);

    // Fixture candles: BTC closes at 95,000 on one day in the window, otherwise 80,000.
    const fixture: SourceAdapter = async (_symbol, from, to) => {
      const closes: DailyClose[] = [];
      for (let s = Math.floor(from.getTime() / 1000 / DAY) * DAY; s <= Math.floor(to.getTime() / 1000 / DAY) * DAY; s += DAY) {
        closes.push({ day: new Date(s * 1000).toISOString().slice(0, 10), start: s, close: closes.length === 1 ? "95000" : "80000" });
      }
      return { closes, sourceUrl: "https://fixture.test/candles" };
    };
    const bot = new ResolverBot({
      db,
      chain: a.chain,
      wallet: wallet(K.resolverBot),
      deployment: d,
      alert,
      adapters: { "coinbase-daily-close": fixture },
      now: () => now,
    });

    // market 3: an admin decides it can't be settled fairly → INVALID; the bot handles 1 and 2
    await bot.manualPropose(ids[2]!, "INVALID", "source outage on the deadline day");
    // market 4 would settle YES from the source, but an admin delisted it (D17) → INVALID, no alert
    await db.market.update({ where: { id: ids[3]! }, data: { delistedAt: now, delistReason: "off-topic" } });
    await indexer.runUntilHead();
    const scan1 = await bot.scan();
    expect(scan1.proposed.sort()).toEqual([ids[0], ids[1], ids[3]].sort());
    await indexer.runUntilHead();
    const proposals = await db.resolution.findMany({ where: { marketId: { in: ids } } });
    const byId = Object.fromEntries(proposals.map((r) => [r.marketId, r]));
    expect(byId[ids[0]!]!.proposedOutcome).toBe("YES");
    expect(byId[ids[1]!]!.proposedOutcome).toBe("NO");
    expect(byId[ids[2]!]!.proposedOutcome).toBe("INVALID");
    expect(byId[ids[3]!]!.proposedOutcome).toBe("INVALID");
    expect(byId[ids[3]!]!.evidence).toMatchObject({ delisted: true, reason: "off-topic", outcome: "INVALID" });
    expect(byId[ids[0]!]!.evidence).toMatchObject({ outcome: "YES", matched: { close: "95000" }, source: { symbol: "BTC-USD" } });

    // nothing to finalize inside the dispute window
    expect((await bot.scan()).finalized).toEqual([]);

    await a.test.increaseTime({ seconds: 21_601 });
    await a.test.mine({ blocks: 1 });
    const later = new Date(Number((await a.chain.getBlock()).timestamp) * 1000);
    const bot2 = new ResolverBot({ db, chain: a.chain, wallet: wallet(K.resolverBot), deployment: d, alert, adapters: { "coinbase-daily-close": fixture }, now: () => later });
    expect((await bot2.scan()).finalized.sort()).toEqual([...ids].sort());
    await indexer.runUntilHead();

    const resolved = await db.market.findMany({ where: { id: { in: ids } }, orderBy: { onchainId: "asc" } });
    expect(resolved.map((m) => [m.status, m.result])).toEqual([
      ["RESOLVED", "YES"],
      ["RESOLVED", "NO"],
      ["RESOLVED", "INVALID"],
      ["RESOLVED", "INVALID"],
    ]);

    // development plan 5.4: the winner redeems and the balance matches the payout
    const shares = (await db.position.findUniqueOrThrow({ where: { wallet_marketId: { wallet: alice.address.toLowerCase(), marketId: ids[0]! } } })).yesShares;
    const before = await a.chain.readContract({ address: d.contracts.DemoUSD, abi: demoUSDAbi, functionName: "balanceOf", args: [alice.address] });
    const redeem = await wallet(K.alice).writeContract({ address: d.contracts.MarketHub, abi: marketHubAbi, functionName: "redeem", args: [m1] });
    await a.chain.waitForTransactionReceipt({ hash: redeem });
    const after = await a.chain.readContract({ address: d.contracts.DemoUSD, abi: demoUSDAbi, functionName: "balanceOf", args: [alice.address] });
    expect(after - before).toBe(BigInt(shares.toFixed(0)));
    await indexer.runUntilHead();
    const pos = await db.position.findUniqueOrThrow({ where: { wallet_marketId: { wallet: alice.address.toLowerCase(), marketId: ids[0]! } } });
    expect(pos.payout!.toFixed(0)).toBe(shares.toFixed(0));
    expect(alerts).toEqual([]);
  });
});
