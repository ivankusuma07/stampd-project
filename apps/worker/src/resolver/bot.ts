import type { Account, Chain, PublicClient, Transport, WalletClient } from "viem";
import { demoUSDAbi, resolverAbi, type Deployment } from "@stampd/chain";
import { RESULT_TO_CHAIN, type MarketSpec } from "@stampd/core";
import type { PrismaClient } from "@stampd/db";
import type { Alerter } from "../lib/alerts";
import { pinJson } from "../lib/ipfs";
import { ADAPTERS, evaluate, readyToResolve, symbolFor, type SourceAdapter } from "./sources";

export type ResolverBotDeps = {
  db: PrismaClient;
  chain: PublicClient;
  wallet: WalletClient<Transport, Chain, Account>;
  deployment: Deployment;
  alert: Alerter;
  ipfsToken?: string;
  adapters?: Record<string, SourceAdapter>;
  now?: () => Date;
};

/**
 * Resolver bot (development plan 5.2, 5.4): at each market's deadline it reads the source named
 * in the rules, builds the evidence, pins it and proposes onchain with a bond; once the dispute
 * window has passed it finalizes. Disputes go to the arbiter multisig, never to this bot.
 */
export class ResolverBot {
  private readonly adapters: Record<string, SourceAdapter>;
  private readonly now: () => Date;

  constructor(private readonly d: ResolverBotDeps) {
    this.adapters = d.adapters ?? ADAPTERS;
    this.now = d.now ?? (() => new Date());
  }

  async scan(): Promise<{ proposed: string[]; finalized: string[] }> {
    const now = this.now();
    const proposed: string[] = [];
    const finalized: string[] = [];

    const due = await this.d.db.market.findMany({
      where: { status: "OPEN", closeTime: { lte: now }, onchainId: { not: null }, resolution: null },
      orderBy: { closeTime: "asc" },
      take: 50,
    });
    for (const m of due) {
      if (!readyToResolve(m.closeTime, now)) continue;
      let ok = false;
      try {
        ok = await this.autoPropose(m.id);
        if (ok) proposed.push(m.id);
      } catch (err) {
        await this.d.alert("resolver.failed", `Could not resolve "${m.question}": ${(err as Error).message}`, { marketId: m.id });
      }
      if (!ok && now > m.resolveBy) {
        await this.d.alert("resolver.late", `"${m.question}" is past its resolve-by time`, { marketId: m.id });
      }
    }

    const finalizable = await this.d.db.resolution.findMany({
      where: { disputed: false, finalizedAt: null, disputeEnds: { lte: now } },
      include: { market: { select: { onchainId: true, status: true } } },
    });
    for (const r of finalizable) {
      if (r.market.status !== "PROPOSED" || r.market.onchainId === null) continue;
      try {
        await this.send("finalize", [r.market.onchainId]);
        finalized.push(r.marketId);
      } catch (err) {
        await this.d.alert("resolver.finalize-failed", (err as Error).message, { marketId: r.marketId });
      }
    }
    return { proposed, finalized };
  }

  /** Read the source and propose. Returns false (with one alert) when it needs a human. */
  async autoPropose(marketId: string): Promise<boolean> {
    const m = await this.d.db.market.findUniqueOrThrow({ where: { id: marketId } });
    const spec = m.spec as unknown as MarketSpec;
    const adapter = spec?.resolution ? this.adapters[spec.resolution.source] : undefined;
    const symbol = spec?.resolution ? symbolFor(spec) : null;
    if (!adapter || !symbol || !m.openedAt) {
      await this.d.alert("resolver.manual", `"${m.question}" has no automatic source — propose it from /admin`, { marketId });
      return false;
    }
    const read = await adapter(symbol, m.openedAt, m.closeTime);
    const verdict = evaluate(spec, read.closes, m.openedAt, m.closeTime);
    const evidence = {
      version: 1,
      marketId: m.onchainId!.toString(),
      questionHash: m.questionHash,
      rule: { ...spec.resolution, closeTime: spec.closeTime },
      source: { id: spec.resolution.source, symbol, url: read.sourceUrl },
      window: verdict.considered,
      matched: verdict.matched,
      lastClose: verdict.lastClose,
      outcome: verdict.outcome,
      readAt: this.now().toISOString(),
    };
    await this.propose(m.onchainId!, verdict.outcome, evidence);
    return true;
  }

  /** Admin-requested proposal (e.g. INVALID for a market that cannot be settled fairly). */
  async manualPropose(marketId: string, outcome: "YES" | "NO" | "INVALID", note: string) {
    const m = await this.d.db.market.findUniqueOrThrow({ where: { id: marketId } });
    if (m.onchainId === null) throw new Error("market is not onchain");
    await this.propose(m.onchainId, outcome, {
      version: 1,
      marketId: m.onchainId.toString(),
      questionHash: m.questionHash,
      manual: true,
      note,
      outcome,
      readAt: this.now().toISOString(),
    });
  }

  private async propose(onchainId: bigint, outcome: "YES" | "NO" | "INVALID", evidence: object) {
    const uri = await pinJson(this.d.ipfsToken, `evidence-${onchainId}`, evidence);
    await this.ensureBondAllowance();
    await this.send("propose", [onchainId, RESULT_TO_CHAIN[outcome], uri]);
  }

  private async ensureBondAllowance() {
    const { chain, wallet, deployment } = this.d;
    const bond = await chain.readContract({ address: deployment.contracts.Resolver, abi: resolverAbi, functionName: "bondAmount" });
    const allowance = await chain.readContract({
      address: deployment.contracts.DemoUSD,
      abi: demoUSDAbi,
      functionName: "allowance",
      args: [wallet.account.address, deployment.contracts.Resolver],
    });
    if (allowance >= bond) return;
    const hash = await wallet.writeContract({
      address: deployment.contracts.DemoUSD,
      abi: demoUSDAbi,
      functionName: "approve",
      args: [deployment.contracts.Resolver, 2n ** 255n],
    });
    await chain.waitForTransactionReceipt({ hash });
  }

  private async send(functionName: "propose" | "finalize", args: readonly unknown[]) {
    const { chain, wallet, deployment } = this.d;
    const { request } = await chain.simulateContract({
      address: deployment.contracts.Resolver,
      abi: resolverAbi,
      functionName,
      args,
      account: wallet.account,
    } as never);
    const hash = await wallet.writeContract(request as never);
    const receipt = await chain.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
    return hash;
  }
}
