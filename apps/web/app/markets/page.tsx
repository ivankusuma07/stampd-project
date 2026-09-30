import type { Metadata } from "next";
import Link from "next/link";
import { Tabs, tabClass } from "@stampd/ui";
import { CATEGORIES } from "@stampd/core";
import { serverGet } from "@/lib/api";
import type { Market } from "@/lib/types";
import { MarketTable } from "@/components/market-table";

export const metadata: Metadata = { title: "Markets" };

const STATUSES = [
  ["open", "Open"],
  ["closed", "Awaiting result"],
  ["resolved", "Resolved"],
  ["all", "All"],
] as const;
const SORTS = [
  ["volume", "Volume"],
  ["closing", "Closing soon"],
  ["moves", "24h move"],
  ["trending", "Trending"],
  ["new", "Newest"],
] as const;

type Search = Promise<{ status?: string; sort?: string; category?: string }>;

export default async function MarketsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const status = STATUSES.some(([s]) => s === sp.status) ? sp.status! : "open";
  const sort = SORTS.some(([s]) => s === sp.sort) ? sp.sort! : "volume";
  const category = CATEGORIES.includes(sp.category as never) ? sp.category : undefined;

  const q = new URLSearchParams({ status, sort, limit: "100" });
  if (category) q.set("category", category);
  const data = await serverGet<{ total: number; markets: Market[] }>(`/markets?${q}`);

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams({ status, sort, ...(category ? { category } : {}) });
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    return `/markets?${next}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">Markets</h1>
        <p className="font-mono text-sm text-ink-3">{data ? `${data.total} markets` : "unavailable"}</p>
      </div>
      <Tabs label="Status">
        {STATUSES.map(([s, label]) => (
          <Link key={s} href={link({ status: s })} className={tabClass(status === s)}>
            {label}
          </Link>
        ))}
      </Tabs>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-ink-3">Category</span>
        <Link href={link({ category: undefined })} className={!category ? "font-semibold" : "text-ink-2"}>
          All
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={link({ category: c })} className={`capitalize ${category === c ? "font-semibold" : "text-ink-2"}`}>
            {c}
          </Link>
        ))}
        <span className="ml-auto text-ink-3">Sort</span>
        {SORTS.map(([s, label]) => (
          <Link key={s} href={link({ sort: s })} className={sort === s ? "font-semibold" : "text-ink-2"}>
            {label}
          </Link>
        ))}
      </div>
      <MarketTable initial={data?.markets ?? []} query={q.toString()} empty="No markets match these filters" />
    </div>
  );
}
