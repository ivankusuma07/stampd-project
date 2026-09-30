import type { Account, Chain, Hex, PublicClient, Transport, WalletClient } from "viem";
import { demoUSDAbi, marketFactoryAbi, type Deployment } from "@stampd/chain";
import { questionHash, type MarketSpec } from "@stampd/core";
import type { PrismaClient } from "@stampd/db";
import type { Alerter } from "../lib/alerts";
import { pinJson } from "../lib/ipfs";

export type MarketCreateDeps = {
  db: PrismaClient;
  chain: PublicClient;
  wallet: WalletClient<Transport, Chain, Account>;
  deployment: Deployment;
  alert: Alerter;
  ipfsToken?: string;
};

/**
 * `market.create` (development plan 4.6): write the PENDING market row, pin the rules, and send
 * `MarketFactory.createMarket` from the creator key. Safe to retry: the row is keyed by
 * questionHash, a sent tx hash is awaited rather than resent, and the factory itself rejects a
 * duplicate questionHash. The indexer turns the row OPEN when it sees `MarketCreated`.
 */
export async function createMarket(d: MarketCreateDeps, predictionId: string): Promise<{ txHash: Hex | null; marketId: string }> {
  const p = await d.db.prediction.findUniqueOrThrow({
    where: { id: predictionId },
    include: { post: true, submissions: { select: { wallet: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (p.status !== "APPROVED" && p.status !== "PUBLISHED") throw new Error(`prediction ${predictionId} is ${p.status}`);
  if (!p.spec || !p.seedAmount || p.openingPriceBps === null || p.feeBps === null) {
    throw new Error(`prediction ${predictionId} has no creation parameters`);
  }
  const spec = p.spec as unknown as MarketSpec;
  const hash = questionHash(spec);
  const kol = await d.db.kol.upsert({
    where: { xHandle: spec.kolHandle },
    update: {},
    create: { xHandle: spec.kolHandle, name: spec.kolHandle, tracked: false },
  });

  const market = await d.db.market.upsert({
    where: { questionHash: hash },
    update: {},
    create: {
      chainId: d.deployment.chainId,
      predictionId: p.id,
      kolId: kol.id,
      question: spec.question,
      rules: spec.rules,
      spec: spec as object,
      questionHash: hash,
      category: spec.category,
      sourcePostId: spec.sourcePostId,
      sourcePostUrl: spec.sourcePostUrl,
      kolSide: spec.kolSide,
      closeTime: new Date(spec.closeTime),
      resolveBy: new Date(spec.resolveBy),
      feeBps: p.feeBps,
      seedAmount: p.seedAmount,
      openingYesPriceBps: p.openingPriceBps,
      yesPriceBps: p.openingPriceBps,
      submittedBy: p.source === "WEB" ? (p.submittedBy ?? p.submissions[0]?.wallet ?? null) : null,
    },
  });
  if (market.status !== "PENDING") return { txHash: (market.createTxHash as Hex) ?? null, marketId: market.id };

  // A tx was already sent by an earlier attempt: wait for it instead of sending another.
  if (market.createTxHash) {
    const receipt = await d.chain.waitForTransactionReceipt({ hash: market.createTxHash as Hex, timeout: 120_000 });
    if (receipt.status === "success") return { txHash: market.createTxHash as Hex, marketId: market.id };
    await d.db.market.update({ where: { id: market.id }, data: { createTxHash: null } });
  }

  if (!market.specUri) {
    const specUri = await pinJson(d.ipfsToken, `market-${hash}`, spec);
    await d.db.market.update({ where: { id: market.id }, data: { specUri } });
  }

  const seed = BigInt(p.seedAmount.toFixed(0));
  await ensureAllowance(d, seed);

  try {
    const { request } = await d.chain.simulateContract({
      address: d.deployment.contracts.MarketFactory,
      abi: marketFactoryAbi,
      functionName: "createMarket",
      args: [
        hash,
        BigInt(spec.sourcePostId),
        BigInt(Math.floor(new Date(spec.closeTime).getTime() / 1000)),
        BigInt(Math.floor(new Date(spec.resolveBy).getTime() / 1000)),
        p.feeBps,
        seed,
        p.openingPriceBps,
      ],
      account: d.wallet.account,
    });
    const txHash = await d.wallet.writeContract(request);
    await d.db.market.update({ where: { id: market.id }, data: { createTxHash: txHash } });
    await d.db.prediction.update({ where: { id: p.id }, data: { createTxHash: txHash, createError: null } });
    const receipt = await d.chain.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    if (receipt.status !== "success") throw new Error(`createMarket reverted in ${txHash}`);
    return { txHash, marketId: market.id };
  } catch (err) {
    const message = (err as Error).message.split("\n")[0]!;
    await d.db.prediction.update({ where: { id: p.id }, data: { createError: message } });
    await d.alert("market.create-failed", `createMarket failed for "${spec.question}": ${message}`, { predictionId });
    throw err;
  }
}

async function ensureAllowance(d: MarketCreateDeps, amount: bigint) {
  const allowance = await d.chain.readContract({
    address: d.deployment.contracts.DemoUSD,
    abi: demoUSDAbi,
    functionName: "allowance",
    args: [d.wallet.account.address, d.deployment.contracts.MarketFactory],
  });
  if (allowance >= amount) return;
  const hash = await d.wallet.writeContract({
    address: d.deployment.contracts.DemoUSD,
    abi: demoUSDAbi,
    functionName: "approve",
    args: [d.deployment.contracts.MarketFactory, 2n ** 255n],
  });
  await d.chain.waitForTransactionReceipt({ hash });
}
