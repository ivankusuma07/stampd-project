import type { Metadata } from "next";
import Link from "next/link";
import { Tabs, tabClass } from "@stampd/ui";
import { CATEGORIES } from "@stampd/core";
import { serverGet } from "@/lib/api";
import type { Market } from "@/lib/types";
import { MarketGrid } from "@/components/market-grid";

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
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-3xl border border-rule bg-surface/80 p-6 backdrop-blur md:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Prediction markets</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight md:text-5xl">Markets</h1>
            <p className="mt-2 max-w-xl text-ink-2">Every market is a call someone made on X. Buy the side you believe; the price is the crowd&apos;s odds.</p>
          </div>
          <span className="rounded-full border border-rule-strong bg-surface-2/70 px-4 py-2 font-mono text-sm text-ink-2">
            {data ? `${data.total} ${data.total === 1 ? "market" : "markets"}` : "unavailable"}
          </span>
        </div>
        <div className="relative mt-6 space-y-3">
          <Tabs label="Status">
            {STATUSES.map(([s, label]) => (
              <Link key={s} href={link({ status: s })} className={tabClass(status === s)}>
                {label}
              </Link>
            ))}
          </Tabs>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 text-xs tracking-[0.2em] text-ink-3 uppercase">Category</span>
            <Link href={link({ category: undefined })} className={tabClass(!category)}>
              All
            </Link>
            {CATEGORIES.map((c) => (
              <Link key={c} href={link({ category: c })} className={`${tabClass(category === c)} capitalize`}>
                {c}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 text-xs tracking-[0.2em] text-ink-3 uppercase">Sort</span>
            {SORTS.map(([s, label]) => (
              <Link key={s} href={link({ sort: s })} className={tabClass(sort === s)}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </header>
      <MarketGrid initial={data?.markets ?? []} query={q.toString()} empty="No markets match these filters" />
    </div>
  );
}
