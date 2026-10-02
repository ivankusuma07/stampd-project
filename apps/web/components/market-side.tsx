"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Eye, EyeOff, Flag, Share2 } from "lucide-react";
import { demoUSDAbi, marketHubAbi, outcomeTokensAbi, resolverAbi } from "@stampd/chain";
import { formatDateTimeUtc, formatShares, formatUsd, shortHash } from "@stampd/core";
import { AnimatedList, Button, HoldButton, ReceiptBlock, TearTicket } from "@stampd/ui";
import { explorerTxUrl } from "@stampd/chain";
import { api } from "@/lib/api";
import { deployment, CHAIN_ID } from "@/lib/chain";
import type { Market, MarketDetail, Trade } from "@/lib/types";
import { shortAddress, usd } from "@/lib/format";
import { RelativeTime } from "@/components/relative-time";
import { useSession } from "./providers";
import { useToasts } from "./toasts";
import { receiptLines, stampFor } from "./receipt";

/** Send a tx with toasts; resolves true when it confirmed. */
function useTx() {
  const config = useConfig();
  const toasts = useToasts();
  const { writeContractAsync } = useWriteContract();
  return async (label: string, req: Parameters<typeof writeContractAsync>[0]) => {
    const id = toasts.push({ title: `${label}…`, description: "Confirm in your wallet", tone: "info" });
    try {
      const hash = await writeContractAsync(req);
      toasts.update(id, { title: `${label} submitted`, hash });
      const r = await waitForTransactionReceipt(config, { hash });
      if (r.status !== "success") throw new Error("reverted");
      toasts.update(id, { title: `${label} confirmed`, tone: "ok", hash });
      return true;
    } catch (err) {
      const msg = (err as { shortMessage?: string }).shortMessage ?? (err as Error).message;
      toasts.update(id, { title: `${label} failed`, description: msg.split("\n")[0]!.slice(0, 140), tone: "error" });
      return false;
    }
  };
}

// ------------------------------------------------------------------ position + redeem

export function PositionBox({ market }: { market: Market }) {
  const { address } = useAccount();
  const tx = useTx();
  const qc = useQueryClient();
  const onchainId = market.onchainId ? BigInt(market.onchainId) : null;
  const bal = useReadContract({
    address: deployment?.contracts.OutcomeTokens,
    abi: outcomeTokensAbi,
    functionName: "balanceOfBatch",
    args: address && onchainId !== null ? [[address, address], [(onchainId << 1n) | 1n, onchainId << 1n]] : undefined,
    query: { enabled: !!deployment && !!address && onchainId !== null, refetchInterval: 8_000 },
  });
  const yes = bal.data?.[0] ?? 0n;
  const no = bal.data?.[1] ?? 0n;
  if (!address || (yes === 0n && no === 0n)) return null;

  const r = market.result;
  const payout = r === "YES" ? yes : r === "NO" ? no : r === "INVALID" ? (yes + no) / 2n : null;
  const value = (yes * BigInt(market.yesPriceBps) + no * BigInt(10_000 - market.yesPriceBps)) / 10_000n;

  return (
    <section className="rounded-2xl border border-rule bg-surface p-4">
      <h2 className="text-xs font-semibold tracking-[0.12em] uppercase">
        <span className="mark">Your position</span>
      </h2>
      <dl className="mt-3 space-y-1 font-mono text-sm">
        {yes > 0n ? (
          <div className="flex justify-between">
            <dt className="text-yes">YES</dt>
            <dd>{formatShares(yes)} shares</dd>
          </div>
        ) : null}
        {no > 0n ? (
          <div className="flex justify-between">
            <dt className="text-no">NO</dt>
            <dd>{formatShares(no)} shares</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-rule pt-1">
          <dt className="text-ink-3">{payout !== null ? "Redeemable" : "Value now"}</dt>
          <dd>{formatUsd(payout ?? value)}</dd>
        </div>
      </dl>
      {market.status === "RESOLVED" && payout !== null ? (
        <Button
          className="mt-3 w-full"
          disabled={payout === 0n && yes + no === 0n}
          onClick={async () => {
            const ok = await tx("Redeem", {
              address: deployment!.contracts.MarketHub,
              abi: marketHubAbi,
              functionName: "redeem",
              args: [onchainId!],
            });
            if (ok) {
              await bal.refetch();
              await qc.invalidateQueries();
            }
          }}
        >
          {payout > 0n ? `Redeem ${formatUsd(payout)}` : "Clear losing shares"}
        </Button>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ resolution + dispute

export function ResolutionPanel({ market }: { market: Market }) {
  const res = market.resolution;
  const tx = useTx();
  const { address } = useAccount();
  const qc = useQueryClient();
  const bond = useReadContract({
    address: deployment?.contracts.Resolver,
    abi: resolverAbi,
    functionName: "bondAmount",
    query: { enabled: !!deployment },
  });
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  if (!res) {
    if (market.status === "CLOSED") {
      return (
        <p className="text-sm text-ink-2">
          Trading closed {formatDateTimeUtc(market.closeTime)}. The resolver reads the named source once the last daily
          candle is final, then proposes the result onchain.
        </p>
      );
    }
    return null;
  }

  const windowOpen = !res.disputed && !res.finalizedAt && new Date(res.disputeEnds) > new Date();
  const proposeUrl = explorerTxUrl(CHAIN_ID, res.proposedTxHash);
  const finalUrl = res.finalizedTxHash ? explorerTxUrl(CHAIN_ID, res.finalizedTxHash) : null;

  return (
    <div className="space-y-3 text-sm">
      <p>
        Proposed <strong>{res.proposedOutcome}</strong> by {shortAddress(res.proposer)}
        {proposeUrl ? (
          <>
            {" "}
            ·{" "}
            <a href={proposeUrl} target="_blank" rel="noreferrer" className="font-mono underline">
              tx {shortHash(res.proposedTxHash)}
            </a>
          </>
        ) : null}
      </p>
      {res.disputed ? (
        <p className="text-no">Disputed by {shortAddress(res.disputer ?? "")}. The arbiter multisig decides; both bonds go to whoever is right.</p>
      ) : res.finalizedAt ? (
        <p>
          Final: {res.finalOutcome} on {formatDateTimeUtc(res.finalizedAt)}
          {finalUrl ? (
            <>
              {" "}
              ·{" "}
              <a href={finalUrl} target="_blank" rel="noreferrer" className="font-mono underline">
                tx {shortHash(res.finalizedTxHash!)}
              </a>
            </>
          ) : null}
          .
        </p>
      ) : (
        <p>Dispute window closes {formatDateTimeUtc(res.disputeEnds)}.</p>
      )}
      <button className="text-xs underline" onClick={() => setEvidenceOpen((o) => !o)} aria-expanded={evidenceOpen}>
        {evidenceOpen ? "Hide evidence" : "Show evidence"}
      </button>
      {evidenceOpen ? (
        <pre className="max-h-64 overflow-auto rounded-xl border border-rule bg-surface-2 p-3 font-mono text-xs whitespace-pre-wrap">
          {res.evidence ? JSON.stringify(res.evidence, null, 2) : res.evidenceUri}
        </pre>
      ) : null}
      {windowOpen && address && bond.data !== undefined ? (
        <div className="rounded-xl border border-rule p-3">
          <p className="mb-2 text-ink-2">
            Think the proposal is wrong? Posting a dispute costs a <strong className="font-mono">{formatUsd(bond.data)}</strong> bond.
            You get it back plus the proposer&apos;s bond if the arbiter agrees with you; you lose it if not.
          </p>
          {/* development plan 5.3: an action that costs money is held, not clicked */}
          <HoldButton
            holdTime={1500}
            radius={4}
            size="md"
            doneLabel="Dispute sent"
            onHold={async () => {
              const r = deployment!.contracts.Resolver;
              const okApprove = await tx("Approve bond", {
                address: deployment!.contracts.DemoUSD,
                abi: demoUSDAbi,
                functionName: "approve",
                args: [r, bond.data!],
              });
              if (!okApprove) return;
              const ok = await tx("Dispute", { address: r, abi: resolverAbi, functionName: "dispute", args: [BigInt(market.onchainId!)] });
              if (ok) await qc.invalidateQueries();
            }}
          >
            Hold to dispute
          </HoldButton>
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ share receipt

export function ShareReceipt({ market, postedAt }: { market: Market; postedAt?: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/markets/${market.id}`;
    const text = `${market.question} (${market.result ? `resolved ${market.result}` : "live odds"}) on STAMPD`;
    if (navigator.share) {
      try {
        await navigator.share({ url, text });
        return;
      } catch {
        // dismissed: fall back to copying
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const block = <ReceiptBlock className="px-4" lines={receiptLines(market, postedAt)} stamp={stampFor(market)} />;

  return (
    <section aria-label="Receipt" className="space-y-2">
      {market.status === "RESOLVED" ? (
        // development plan 6.2: tearing the stub opens Share; a normal Share button sits next to it
        <TearTicket
          width={340}
          height={320}
          stubSize={64}
          radius={6}
          holes={9}
          tilt={false}
          border
          borderColor="var(--rule-strong)"
          background="var(--surface)"
          color="var(--ink)"
          stubBackground="var(--paper)"
          ariaLabel="Tear the stub to share this receipt"
          onTear={share}
          stub={<span className="font-mono text-xs tracking-widest">SHARE</span>}
        >
          {block}
        </TearTicket>
      ) : (
        <div className="rounded-2xl border border-rule bg-surface">{block}</div>
      )}
      <Button variant="secondary" className="w-full" onClick={share}>
        <Share2 size={16} strokeWidth={1.5} aria-hidden />
        {copied ? "Link copied" : "Share receipt"}
      </Button>
    </section>
  );
}

// ------------------------------------------------------------------ watch + flag

export function WatchFlag({ market, watching }: { market: Market; watching: boolean }) {
  const { signedIn } = useSession();
  const qc = useQueryClient();
  const [w, setW] = useState(watching);
  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState("");
  const [flagged, setFlagged] = useState(false);
  if (!signedIn) return <p className="text-xs text-ink-3">Sign in to watch or flag this market.</p>;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          aria-pressed={w}
          onClick={async () => {
            await api(`/markets/${market.id}/watch`, { method: w ? "DELETE" : "PUT" });
            setW(!w);
            await qc.invalidateQueries({ queryKey: ["market", market.id] });
          }}
        >
          {w ? <EyeOff size={16} strokeWidth={1.5} aria-hidden /> : <Eye size={16} strokeWidth={1.5} aria-hidden />}
          {w ? "Watching" : "Watch"}
        </Button>
        <Button variant="ghost" onClick={() => setFlagging((f) => !f)} aria-expanded={flagging}>
          <Flag size={16} strokeWidth={1.5} aria-hidden />
          Flag
        </Button>
      </div>
      {flagging && !flagged ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await api(`/markets/${market.id}/flag`, { method: "POST", json: { reason } });
            setFlagged(true);
          }}
        >
          <label htmlFor="flag-reason" className="text-xs text-ink-2">
            What&apos;s wrong with this market? A moderator reads every flag.
          </label>
          <textarea
            id="flag-reason"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-rule-strong bg-surface p-2 text-sm"
          />
          <Button type="submit" variant="secondary">
            Send flag
          </Button>
        </form>
      ) : null}
      {flagged ? <p className="text-xs text-ink-2">Thanks, flagged for review.</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ activity

export function Activity({ marketId, initial }: { marketId: string; initial: Trade[] }) {
  const { data } = useQuery({
    queryKey: ["trades", marketId],
    queryFn: () => api<{ trades: Trade[] }>(`/markets/${marketId}/trades?limit=30`).then((r) => r.trades),
    initialData: initial,
    refetchInterval: 10_000,
  });
  if (!data || data.length === 0) return <p className="text-sm text-ink-2">No trades yet.</p>;
  return (
    <AnimatedList
      className="divide-y divide-rule"
      items={data}
      getKey={(t) => `${t.txHash}:${t.logIndex}`}
      render={(t) => {
        const url = explorerTxUrl(CHAIN_ID, t.txHash);
        return (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 font-mono text-sm">
            <span className="w-24 shrink-0 text-ink-2">{shortAddress(t.wallet)}</span>
            <span className={`whitespace-nowrap ${t.outcome === "YES" ? "text-yes" : "text-no"}`}>
              {t.isBuy ? "bought" : "sold"} {t.outcome}
            </span>
            <span className="whitespace-nowrap text-ink">
              {formatShares(BigInt(t.shares))} for {usd(t.collateral)}
            </span>
            <span className="ml-auto text-xs text-ink-3">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="underline">
                  <RelativeTime iso={t.blockTime} />
                </a>
              ) : (
                <RelativeTime iso={t.blockTime} />
              )}
            </span>
          </div>
        );
      }}
    />
  );
}

export type { MarketDetail };
