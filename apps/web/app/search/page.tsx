import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, EmptyState, PriceChip, SectionHeading } from "@stampd/ui";
import { serverGet } from "@/lib/api";
import type { KolRef, Market } from "@/lib/types";

export const metadata: Metadata = { title: "Search" };

type Search = Promise<{ q?: string }>;

export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const { q = "" } = await searchParams;
  const term = q.trim().slice(0, 80);
  const data = term ? await serverGet<{ markets: Market[]; kols: KolRef[] }>(`/search?q=${encodeURIComponent(term)}`, 0) : null;

  return (
    <div className="space-y-8">
      <form action="/search" className="flex max-w-xl gap-2">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={term}
          placeholder="Search markets and KOLs"
          className="h-10 flex-1 rounded-xl border border-rule-strong bg-surface px-3"
        />
        <button className="h-10 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-ink hover:brightness-110">Search</button>
      </form>
      {!term ? null : !data || (data.markets.length === 0 && data.kols.length === 0) ? (
        <EmptyState title={`Nothing found for “${term}”`} />
      ) : (
        <>
          {data.kols.length > 0 ? (
            <section>
              <SectionHeading>KOLs</SectionHeading>
              <ul className="flex flex-wrap gap-4">
                {data.kols.map((k) => (
                  <li key={k.id}>
                    <Link href={`/kol/${k.handle}`} className="flex items-center gap-2">
                      <Avatar src={k.avatarUrl} handle={k.handle} />@{k.handle}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.markets.length > 0 ? (
            <section>
              <SectionHeading>Markets</SectionHeading>
              <ul className="divide-y divide-rule">
                {data.markets.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <Link href={`/markets/${m.id}`} className="flex-1 font-serif text-lg">
                      {m.question}
                    </Link>
                    <PriceChip side="YES" bps={m.yesPriceBps} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
