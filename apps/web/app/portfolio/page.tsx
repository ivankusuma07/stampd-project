"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { marketHubAbi } from "@stampd/chain";
import { formatShares, formatUsd } from "@stampd/core";
import { Button, EmptyState, SectionHeading } from "@stampd/ui";
import { api } from "@/lib/api";
import { deployment } from "@/lib/chain";
import type { PortfolioPosition } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/format";
import { SignInGate } from "@/components/sign-in-gate";
import { useToasts } from "@/components/toasts";
import { PageHeader } from "@/components/page-header";

function Positions() {
  const qc = useQueryClient();
  const config = useConfig();
  const toasts = useToasts();
  const { writeContractAsync } = useWriteContract();
  const { data, isLoading } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => api<{ positions: PortfolioPosition[] }>("/portfolio").then((r) => r.positions),
    refetchInterval: 15_000,
  });

  if (isLoading) return <p className="text-sm text-ink-3">Loading…</p>;
  const positions = data ?? [];
  if (positions.length === 0) {
    return (
      <EmptyState title="No positions yet">
        Grab demo USD from the <Link href="/faucet" className="underline">faucet</Link>, then pick a{" "}
        <Link href="/markets" className="underline">market</Link>.
      </EmptyState>
    );
  }

  const redeemable = positions.filter((p) => BigInt(p.redeemable) > 0n);
  const open = positions.filter((p) => p.market.status !== "RESOLVED");
  const closed = positions.filter((p) => p.market.status === "RESOLVED");
  const totalValue = open.reduce((s, p) => s + BigInt(p.value), 0n);
  const totalRedeemable = redeemable.reduce((s, p) => s + BigInt(p.redeemable), 0n);

  const redeem = async (p: PortfolioPosition) => {
    const id = toasts.push({ title: "Redeem…", description: "Confirm in your wallet", tone: "info" });
    try {
      const hash = await writeContractAsync({
        address: deployment!.contracts.MarketHub,
        abi: marketHubAbi,
        functionName: "redeem",
        args: [BigInt(p.market.onchainId!)],
      });
      toasts.update(id, { title: "Redeem submitted", hash });
      await waitForTransactionReceipt(config, { hash });
      toasts.update(id, { title: `Redeemed ${formatUsd(BigInt(p.redeemable))}`, tone: "ok", hash });
      await qc.invalidateQueries({ queryKey: ["portfolio"] });
    } catch (err) {
      toasts.update(id, { title: "Redeem failed", description: (err as { shortMessage?: string }).shortMessage ?? "", tone: "error" });
    }
  };

  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-6 md:grid-cols-3">
        <div className="border-t border-rule-strong pt-2">
          <dt className="text-xs tracking-[0.08em] text-ink-3 uppercase">Open positions value</dt>
          <dd className="mt-1 font-mono text-2xl">{formatUsd(totalValue)}</dd>
        </div>
        <div className="border-t border-rule-strong pt-2">
          <dt className="text-xs tracking-[0.08em] text-ink-3 uppercase">Ready to redeem</dt>
          <dd className="mt-1 font-mono text-2xl">{totalRedeemable > 0n ? <span className="mark">{formatUsd(totalRedeemable)}</span> : formatUsd(0n)}</dd>
        </div>
      </dl>

      {redeemable.length > 0 ? (
        <section>
          <SectionHeading>Winnings to redeem</SectionHeading>
          <ul className="divide-y divide-rule">
            {redeemable.map((p) => (
              <li key={p.market.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/markets/${p.market.id}`} className="min-w-0 flex-1 font-serif text-lg">
                  {p.market.question}
                </Link>
                <span className="font-mono text-sm text-ink-2">Resolved {p.market.result}</span>
                <Button onClick={() => redeem(p)}>Redeem {formatUsd(BigInt(p.redeemable))}</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeading>Open</SectionHeading>
        {open.length === 0 ? <p className="text-sm text-ink-2">No open positions.</p> : <PositionTable rows={open} />}
      </section>
      {closed.length > 0 ? (
        <section>
          <SectionHeading>Settled</SectionHeading>
          <PositionTable rows={closed} settled />
        </section>
      ) : null}
    </div>
  );
}

function PositionTable({ rows, settled }: { rows: PortfolioPosition[]; settled?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-rule bg-surface/70 px-5 py-2 backdrop-blur">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-[10px] tracking-[0.2em] text-ink-3 uppercase">
            <th className="py-2 font-medium">Market</th>
            <th className="py-2 text-right font-medium">Shares</th>
            <th className="py-2 text-right font-medium">Cost</th>
            <th className="py-2 text-right font-medium">{settled ? "Payout" : "Value"}</th>
            <th className="py-2 text-right font-medium">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const cost = BigInt(p.costBasis);
            const now = settled ? BigInt(p.payout ?? p.redeemable) : BigInt(p.value);
            const pnl = now - cost;
            return (
              <tr key={p.market.id} className="border-b border-rule align-top">
                <td className="py-3 pr-4">
                  <Link href={`/markets/${p.market.id}`} className="font-serif text-base">
                    {p.market.question}
                  </Link>
                  <p className="text-xs text-ink-3">{p.market.result ? `Resolved ${p.market.result}` : STATUS_LABEL[p.market.status]}</p>
                </td>
                <td className="py-3 text-right font-mono whitespace-nowrap">
                  {BigInt(p.yesShares) > 0n ? <span className="block text-yes">YES {formatShares(BigInt(p.yesShares))}</span> : null}
                  {BigInt(p.noShares) > 0n ? <span className="block text-no">NO {formatShares(BigInt(p.noShares))}</span> : null}
                </td>
                <td className="py-3 text-right font-mono">{formatUsd(cost)}</td>
                <td className="py-3 text-right font-mono">{formatUsd(now)}</td>
                <td className={`py-3 text-right font-mono ${pnl > 0n ? "text-yes" : pnl < 0n ? "text-no" : ""}`}>
                  {pnl > 0n ? "+" : ""}
                  {formatUsd(pnl)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Your positions" title="Portfolio">
        Every share you hold, what it&apos;s worth now, and anything ready to redeem.
      </PageHeader>
      <SignInGate why="Your positions are tied to your wallet.">
        <Positions />
      </SignInGate>
    </div>
  );
}
