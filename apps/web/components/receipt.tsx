import Link from "next/link";
import { ReceiptBlock, type StampKind } from "@stampd/ui";
import { formatCents, formatDateUtc, formatInt, shortHash } from "@stampd/core";
import { explorerTxUrl } from "@stampd/chain";
import type { Market } from "@/lib/types";

/** CALLED IT when the KOL's side won, MISSED when it lost, VOID for INVALID. */
export function stampFor(m: Pick<Market, "result" | "kolSide">): StampKind | undefined {
  if (!m.result) return undefined;
  if (m.result === "INVALID") return "VOID";
  return m.result === m.kolSide ? "CALLED IT" : "MISSED";
}

/** Receipt lines shared by the market page, the "Just resolved" row and the share image. */
export function receiptLines(m: Market, postedAt?: string) {
  const finalCents = m.result === "YES" ? 10_000 : m.result === "NO" ? 0 : 5_000;
  const url = m.settledTxHash ? explorerTxUrl(m.chainId, m.settledTxHash) : null;
  return [
    { label: "Call", value: `@${m.kol.handle}${postedAt ? ` · ${formatDateUtc(postedAt)}` : ""}` },
    { label: "Question", value: <span className="font-serif text-base">{m.question}</span> },
    { label: "Called", value: m.kolSide },
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
                  <a href={url} target="_blank" rel="noreferrer" className="underline">
                    tx {shortHash(m.settledTxHash)}
                  </a>
                ) : (
                  `tx ${shortHash(m.settledTxHash)}`
                )}
                {m.openedBlock ? ` · opened at block ${formatInt(BigInt(m.openedBlock))}` : ""}
              </>
            ),
          },
        ]
      : []),
  ];
}

export function MiniReceipt({ market }: { market: Market }) {
  return (
    <Link href={`/markets/${market.id}`} className="block rounded-[6px] border border-rule bg-surface px-4 hover:border-rule-strong">
      <ReceiptBlock
        className="border-t-0"
        lines={[
          { label: "Call", value: `@${market.kol.handle}` },
          { label: "Question", value: <span className="font-serif">{market.question}</span> },
          { label: "Result", value: market.result ?? "—" },
        ]}
        stamp={stampFor(market)}
      />
    </Link>
  );
}
