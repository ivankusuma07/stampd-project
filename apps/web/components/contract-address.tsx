"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { shortHash } from "@stampd/core";

/**
 * STAMPD's contract address (CA). Reserved space until NEXT_PUBLIC_CONTRACT_ADDRESS is set: it reads
 * "To be announced" so nobody pastes a guessed address. Once set, the address shows in mono (short
 * form on phones) with a copy button.
 */
const CA = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() || null;

export function ContractAddress({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!CA) return;
    try {
      await navigator.clipboard.writeText(CA);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the address is still on screen to select by hand
    }
  };

  return (
    <div
      className={`inline-flex max-w-full items-center gap-2 rounded-full border border-rule-strong bg-surface/70 pl-3.5 text-xs backdrop-blur ${CA ? "py-1 pr-1" : "py-1.5 pr-3.5"} ${className}`}
    >
      <span className="shrink-0 font-semibold tracking-[0.2em] text-ink-3 uppercase">CA</span>
      {CA ? (
        <>
          <span className="min-w-0 truncate font-mono text-ink" title={CA}>
            <span className="sm:hidden">{shortHash(CA)}</span>
            <span className="hidden sm:inline">{CA}</span>
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Contract address copied" : "Copy contract address"}
            title="Copy"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-accent"
          >
            {copied ? <Check size={14} strokeWidth={2} className="text-yes" aria-hidden /> : <Copy size={14} strokeWidth={1.75} aria-hidden />}
          </button>
          <span role="status" className="sr-only">
            {copied ? "Copied" : ""}
          </span>
        </>
      ) : (
        <span className="text-ink-2">To be announced</span>
      )}
    </div>
  );
}
