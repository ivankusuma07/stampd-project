"use client";

import Link from "next/link";
import { Avatar, DecryptedText, GlareHover, ReceiptBlock, Stamp, type StampKind } from "@stampd/ui";
import { formatCents, formatDateUtc, formatInt, shortHash } from "@stampd/core";
import { explorerTxUrl } from "@stampd/chain";
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

/** Resolved-call receipt card: glare on hover, the settlement hash decrypts into view. */
export function MiniReceipt({ market }: { market: Market }) {
  const stamp = stampFor(market);
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
      <Link href={`/markets/${market.id}`} className="relative flex h-full w-full flex-col gap-3 p-5 text-left">
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Avatar src={market.kol.avatarUrl} handle={market.kol.handle} size={20} />@{market.kol.handle}
          <span className="ml-auto">{market.settledAt ? formatDateUtc(market.settledAt) : ""}</span>
        </div>
        <p className="line-clamp-3 text-sm font-semibold text-ink">{market.question}</p>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-dashed border-rule-strong pt-3 font-mono text-xs">
          <div className="space-y-1 text-ink-3">
            <div>
              RESULT <span className="text-ink">{market.result}</span> · CALLED{" "}
              <span className={market.kolSide === "YES" ? "text-yes" : "text-no"}>{market.kolSide}</span>
            </div>
            {market.settledTxHash ? (
              <DecryptedText text={`tx ${shortHash(market.settledTxHash)}`} animateOn="view" speed={40} className="text-ink-2" encryptedClassName="text-accent" />
            ) : null}
          </div>
          {stamp ? <Stamp kind={stamp} /> : null}
        </div>
      </Link>
    </GlareHover>
  );
}

export { ReceiptBlock };
