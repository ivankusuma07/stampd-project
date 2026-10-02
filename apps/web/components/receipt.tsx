"use client";

import Link from "next/link";
import { Avatar, DecryptedText, GlareHover, ReceiptBlock, Stamp, type StampKind } from "@stampd/ui";
import { formatCents, formatDateUtc, formatInt, shortHash } from "@stampd/core";
import { explorerTxUrl } from "@stampd/chain";
import { ExternalLink } from "lucide-react";
import type { Market } from "@/lib/types";

/** CALLED IT when the KOL's side won, MISSED when it lost, VOID for INVALID. */
export function stampFor(m: Pick<Market, "result" | "kolSide">): StampKind | undefined {
  if (!m.result) return undefined;
  if (m.result === "INVALID") return "VOID";
  return m.result === m.kolSide ? "CALLED IT" : "MISSED";
}

/** Receipt lines shared by the market page and the share card. */
export function receiptLines(m: Market, postedAt?: string) {
  const finalCents = m.result === "YES" ? 10_000 : m.result === "NO" ? 0 : 5_000;
  const url = m.settledTxHash ? explorerTxUrl(m.chainId, m.settledTxHash) : null;
  return [
    { label: "Call", value: `@${m.kol.handle}${postedAt ? ` · ${formatDateUtc(postedAt)}` : ""}` },
    { label: "Question", value: <span className="font-sans text-sm font-semibold">{m.question}</span> },
    { label: "Called", value: <span className={m.kolSide === "YES" ? "text-yes" : "text-no"}>{m.kolSide}</span> },
    { label: "Result", value: m.result ?? "open" },
    m.result
      ? { label: "Final", value: `${formatCents(finalCents)} · opened ${formatCents(m.openingYesPriceBps)}` }
      : { label: "Now", value: `YES ${formatCents(m.yesPriceBps)} · opened ${formatCents(m.openingYesPriceBps)}` },
    ...(m.settledTxHash
      ? [
          {
            label: "Settled",
            value: (
              <>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    tx {shortHash(m.settledTxHash)}
                  </a>
                ) : (
                  `tx ${shortHash(m.settledTxHash)}`
                )}
                {m.openedBlock ? ` · block ${formatInt(BigInt(m.openedBlock))}` : ""}
              </>
            ),
          },
        ]
      : []),
  ];
}

/**
 * Resolved-call receipt card: glare on hover, the settlement hash decrypts into view. The question
 * link stretches over the whole card; the explorer link sits above it so it can't be nested in it.
 */
export function MiniReceipt({ market }: { market: Market }) {
  const stamp = stampFor(market);
  const hash = market.settledTxHash ?? market.resolution?.finalizedTxHash ?? null;
  const url = hash ? explorerTxUrl(market.chainId, hash) : null;
  const tone = market.result === "YES" ? "text-yes" : market.result === "NO" ? "text-no" : "text-ink";
  return (
    <GlareHover
      width="100%"
      height="100%"
      background="var(--surface)"
      borderColor="var(--rule)"
      borderRadius="18px"
      glareColor="#c8ff2e"
      glareOpacity={0.18}
      glareAngle={-35}
      glareSize={260}
      className="place-items-stretch!"
    >
      <div className="relative flex h-full w-full flex-col gap-3 p-5 text-left">
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Avatar src={market.kol.avatarUrl} handle={market.kol.handle} size={20} />@{market.kol.handle}
          <span className="ml-auto">{market.settledAt ? formatDateUtc(market.settledAt) : ""}</span>
        </div>
        <Link
          href={`/markets/${market.id}`}
          className="line-clamp-3 text-sm font-semibold text-ink after:absolute after:inset-0 after:content-[''] hover:text-accent"
        >
          {market.question}
        </Link>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-dashed border-rule-strong pt-3 font-mono text-xs">
          <div className="min-w-0 space-y-1 text-ink-3">
            <div>
              <span className={`font-bold ${tone}`}>{market.result === "INVALID" ? "INVALID" : `${market.result} won`}</span> · CALLED{" "}
              <span className={market.kolSide === "YES" ? "text-yes" : "text-no"}>{market.kolSide}</span>
            </div>
            {hash ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <DecryptedText text={`tx ${shortHash(hash)}`} animateOn="view" speed={40} className="text-ink-2" encryptedClassName="text-accent" />
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`View transaction ${shortHash(hash)} on the Robinhood Chain explorer`}
                    className="relative z-10 inline-flex items-center gap-1 font-sans font-semibold text-accent hover:underline"
                  >
                    Explorer
                    <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
          {stamp ? <Stamp kind={stamp} /> : null}
        </div>
      </div>
    </GlareHover>
  );
}

export { ReceiptBlock };
