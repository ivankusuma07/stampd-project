"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@stampd/ui";
import { api } from "@/lib/api";
import type { Market } from "@/lib/types";
import { MarketCard } from "./market-card";

/** Grid of market cards; refreshes every 15s so prices stay live. `query` empty = static list. */
export function MarketGrid({ initial, query, empty, compact }: { initial: Market[]; query: string; empty?: string; compact?: boolean }) {
  const { data } = useQuery({
    queryKey: ["market-grid", query],
    queryFn: () => api<{ markets: Market[] }>(`/markets?${query}`).then((r) => r.markets),
    initialData: initial,
    refetchInterval: 15_000,
    enabled: query !== "",
  });
  const markets = data ?? [];
  if (markets.length === 0) return <EmptyState title={empty ?? "No markets here yet"} />;
  return (
    <div className={compact ? "grid gap-4" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
      {markets.map((m) => (
        <MarketCard key={m.id} m={m} />
      ))}
    </div>
  );
}
