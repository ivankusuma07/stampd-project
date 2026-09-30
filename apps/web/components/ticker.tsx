"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LogoLoop } from "@stampd/ui";
import { formatCents } from "@stampd/core";
import { api } from "@/lib/api";
import type { Market } from "@/lib/types";
import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * Live price tape under the header (React Bits LogoLoop): every open market with its YES price
 * and 24h move. Hidden until there is real data; pauses on hover.
 */
export function Ticker() {
  const { data } = useQuery({
    queryKey: ["ticker"],
    queryFn: () => api<{ markets: Market[] }>("/markets?status=open&sort=volume&limit=24").then((r) => r.markets),
    refetchInterval: 30_000,
  });
  if (!data || data.length === 0) return null;

  const items = data.map((m) => ({
    node: (
      <Link href={`/markets/${m.id}`} className="flex items-center gap-2 font-mono text-xs whitespace-nowrap text-ink-2 hover:text-ink">
        <span className="text-ink-3">@{m.kol.handle}</span>
        <span className="max-w-[18rem] truncate font-sans text-ink">{m.question}</span>
        <span className="text-yes">YES {formatCents(m.yesPriceBps)}</span>
        {m.change24hBps ? (
          <span className={`inline-flex items-center gap-0.5 ${m.change24hBps > 0 ? "text-yes" : "text-no"}`}>
            {m.change24hBps > 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {Math.abs(Math.round(m.change24hBps / 100))}¢
          </span>
        ) : null}
      </Link>
    ),
    title: m.question,
  }));

  return (
    <div className="relative z-20 overflow-hidden border-b border-rule bg-surface/50 py-2 backdrop-blur" aria-label="Live market prices">
      <LogoLoop logos={items} speed={40} gap={48} logoHeight={18} pauseOnHover fadeOut fadeOutColor="var(--paper)" ariaLabel="Live market prices" />
    </div>
  );
}
