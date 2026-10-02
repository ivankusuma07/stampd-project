"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Stamp } from "@stampd/ui";
import { formatDateTimeUtc } from "@stampd/core";
import { explorerTxUrl } from "@stampd/chain";
import type { Market } from "@/lib/types";
import { stampFor } from "./receipt";

/** The settlement transaction: MarketSettled, emitted in the same tx as the resolver's finalize/arbitrate. */
export function settlementHash(m: Pick<Market, "settledTxHash" | "resolution">) {
  return m.settledTxHash ?? m.resolution?.finalizedTxHash ?? null;
}

function outcomeLine(result: Market["result"]) {
  return result === "INVALID" ? "INVALID: neither side won, YES and NO each redeem at 50¢" : `${result} won`;
}

function CopyButton({ text, label, compact }: { text: () => string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: everything is on screen to select by hand
    }
  };
  const icon = copied ? <Check size={14} strokeWidth={2} className="text-yes" aria-hidden /> : <Copy size={14} strokeWidth={1.75} aria-hidden />;
  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label}: copied` : label}
        title={label}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-accent"
      >
        {icon}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-rule-strong bg-surface-2/60 px-4 text-sm font-semibold text-ink transition hover:border-ink-3"
    >
      {icon}
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * Result card on a settled market: the outcome, the market, the settlement tx hash in full and a
 * link to it on the Robinhood Chain explorer, plus one button that copies all of it as text.
 */
export function SettlementCard({ market: m }: { market: Market }) {
  if (m.status !== "RESOLVED" || !m.result) return null;
  const hash = settlementHash(m);
  const url = hash ? explorerTxUrl(m.chainId, hash) : null;
  const stamp = stampFor(m);
  const tone = m.result === "YES" ? "text-yes" : m.result === "NO" ? "text-no" : "text-ink";
  const ring = m.result === "YES" ? "border-yes/30 glow-yes" : m.result === "NO" ? "border-no/30 glow-no" : "border-rule-strong";
  const details = () =>
    [
      `Market: ${m.question}`,
      `Outcome: ${outcomeLine(m.result)}`,
      `TX hash: ${hash ?? "being indexed"}`,
      `Explorer: ${url ?? "-"}`,
      `STAMPD: ${window.location.origin}/markets/${m.id}`,
    ].join("\n");

  return (
    <section aria-labelledby="result-heading" className={`rounded-2xl border bg-surface/80 p-6 backdrop-blur ${ring}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Settled onchain</p>
          <h2 id="result-heading" className={`mt-1 font-display text-3xl font-extrabold tracking-tight md:text-4xl ${tone}`}>
            {m.result === "INVALID" ? "Resolved INVALID" : `${m.result} won`}
          </h2>
          {m.result === "INVALID" ? <p className="mt-1 text-sm text-ink-2">Neither side won. YES and NO each redeem at 50¢.</p> : null}
        </div>
        {stamp ? <Stamp kind={stamp} /> : null}
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-dashed border-rule-strong pt-4 text-sm sm:grid-cols-[7rem_1fr]">
        <dt className="text-[11px] font-semibold tracking-[0.2em] text-ink-3 uppercase sm:pt-0.5">Market</dt>
        <dd className="font-semibold text-ink">{m.question}</dd>

        <dt className="text-[11px] font-semibold tracking-[0.2em] text-ink-3 uppercase sm:pt-0.5">Outcome</dt>
        <dd className={`font-mono font-bold ${tone}`}>{m.result === "INVALID" ? "INVALID" : `${m.result} won`}</dd>

        <dt className="text-[11px] font-semibold tracking-[0.2em] text-ink-3 uppercase sm:pt-1.5">TX hash</dt>
        <dd className="flex min-w-0 items-start gap-1">
          {hash ? (
            <>
              <span className="min-w-0 pt-1 font-mono text-xs break-all text-ink sm:text-sm">{hash}</span>
              <CopyButton compact label="Copy TX hash" text={() => hash} />
            </>
          ) : (
            <span className="pt-1 text-ink-3">Being indexed, check back in a minute.</span>
          )}
        </dd>

        <dt className="text-[11px] font-semibold tracking-[0.2em] text-ink-3 uppercase sm:pt-0.5">Explorer</dt>
        <dd>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
              View on Robinhood Chain explorer
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
            </a>
          ) : (
            <span className="text-ink-3">-</span>
          )}
        </dd>

        {m.settledAt ? (
          <>
            <dt className="text-[11px] font-semibold tracking-[0.2em] text-ink-3 uppercase sm:pt-0.5">Settled</dt>
            <dd className="font-mono text-ink-2">{formatDateTimeUtc(m.settledAt)}</dd>
          </>
        ) : null}
      </dl>

      <div className="mt-5">
        <CopyButton label="Copy result details" text={details} />
      </div>
    </section>
  );
}
