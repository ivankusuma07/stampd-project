"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Change, EmptyState, PriceChip } from "@stampd/ui";
import { formatDateUtc } from "@stampd/core";
import { api } from "@/lib/api";
import type { Market } from "@/lib/types";
import { STATUS_LABEL, usd } from "@/lib/format";
import { RelativeTime } from "@/components/relative-time";
import { LivePrice } from "./live-price";

/**
 * Market list (development plan 1.5 "Density"): a table on desktop (question · YES · NO · 24h ·
 * volume · closes) and cards on phones. Refreshes every 15s so prices stay live.
 */
export function MarketTable({ initial, query, empty }: { initial: Market[]; query: string; empty?: string }) {
  const { data } = useQuery({
    queryKey: ["markets", query],
    queryFn: () => api<{ markets: Market[] }>(`/markets?${query}`).then((r) => r.markets),
    initialData: initial,
    refetchInterval: 15_000,
  });
  const markets = data ?? [];
  if (markets.length === 0) return <EmptyState title={empty ?? "No markets here yet"} />;

  return (
    <>
      <table className="hidden w-full border-collapse text-sm md:table">
        <thead>
          <tr className="border-b border-ink text-left text-xs tracking-[0.08em] text-ink-3 uppercase">
            <th className="py-2 pr-4 font-medium">Market</th>
            <th className="py-2 pr-4 text-right font-medium">Yes</th>
            <th className="py-2 pr-4 text-right font-medium">No</th>
            <th className="py-2 pr-4 text-right font-medium">24h</th>
            <th className="py-2 pr-4 text-right font-medium">Volume</th>
            <th className="py-2 text-right font-medium">Closes</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.id} className="border-b border-rule align-top hover:bg-surface">
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2 text-xs text-ink-3">
                  <Avatar src={m.kol.avatarUrl} handle={m.kol.handle} size={20} />
                  <span>@{m.kol.handle}</span>
                  <span aria-hidden>·</span>
                  <span className="capitalize">{m.category}</span>
                  {m.status !== "OPEN" ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-medium text-ink-2">{m.result ? `Resolved ${m.result}` : STATUS_LABEL[m.status]}</span>
                    </>
                  ) : null}
                </div>
                <Link href={`/markets/${m.id}`} className="mt-1 block font-serif text-lg leading-[1.2] font-medium text-ink">
                  {m.question}
                </Link>
              </td>
              <td className="py-3 pr-4 text-right whitespace-nowrap">
                <span className="text-xs text-yes">YES </span>
                <LivePrice bps={m.yesPriceBps} side="YES" />
              </td>
              <td className="py-3 pr-4 text-right whitespace-nowrap">
                <span className="text-xs text-no">NO </span>
                <LivePrice bps={m.yesPriceBps} side="NO" />
              </td>
              <td className="py-3 pr-4 text-right">
                <Change bps={m.change24hBps} />
              </td>
              <td className="py-3 pr-4 text-right font-mono whitespace-nowrap">{usd(m.volume, { compact: true })}</td>
              <td className="py-3 text-right font-mono whitespace-nowrap text-ink-2" title={formatDateUtc(m.closeTime)}>
                {m.status === "OPEN" ? <RelativeTime iso={m.closeTime} mode="until" /> : formatDateUtc(m.closeTime)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-rule border-y border-rule md:hidden">
        {markets.map((m) => (
          <li key={m.id} className="py-3">
            <div className="flex items-center gap-2 text-xs text-ink-3">
              <Avatar src={m.kol.avatarUrl} handle={m.kol.handle} size={20} />@{m.kol.handle}
              <span aria-hidden>·</span>
              {m.status === "OPEN" ? (
                <>
                  closes in <RelativeTime iso={m.closeTime} mode="until" />
                </>
              ) : m.result ? (
                `Resolved ${m.result}`
              ) : (
                STATUS_LABEL[m.status]
              )}
            </div>
            <Link href={`/markets/${m.id}`} className="mt-1 block font-serif text-lg leading-[1.2] font-medium">
              {m.question}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PriceChip side="YES" bps={m.yesPriceBps} />
              <PriceChip side="NO" bps={10_000 - m.yesPriceBps} />
              <Change bps={m.change24hBps} />
              <span className="ml-auto font-mono text-xs text-ink-3">{usd(m.volume, { compact: true })} vol</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
