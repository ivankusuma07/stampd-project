import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, EdgeBadge, EmptyState, HitRate, Tabs, tabClass } from "@stampd/ui";
import { serverGet } from "@/lib/api";
import type { KolListItem } from "@/lib/types";

export const metadata: Metadata = { title: "KOLs" };

const SORTS = [
  ["live", "Most live"],
  ["markets", "Most markets"],
  ["hitRate", "Hit rate"],
  ["edge", "Edge"],
  ["handle", "A–Z"],
] as const;

type Search = Promise<{ sort?: string }>;

/**
 * KOL directory (plan B8). Hit rate and edge always show their sample size; a KOL with few
 * resolved calls sorts on the numbers it has, and the n makes that visible.
 */
export default async function KolsPage({ searchParams }: { searchParams: Search }) {
  const { sort: s } = await searchParams;
  const sort = SORTS.some(([k]) => k === s) ? s! : "live";
  const data = await serverGet<{ kols: KolListItem[] }>(`/kols?sort=${sort}`);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl font-semibold">KOLs</h1>
      <p className="max-w-prose text-ink-2">
        Accounts whose calls become markets. <strong>Hit rate</strong> counts calls that resolved their way.{" "}
        <strong>Edge</strong> measures how much they beat the crowd&apos;s odds — see{" "}
        <Link href="/insights#method" className="underline">
          how it&apos;s computed
        </Link>
        .
      </p>
      <Tabs label="Sort KOLs">
        {SORTS.map(([k, label]) => (
          <Link key={k} href={`/kols?sort=${k}`} className={tabClass(sort === k)}>
            {label}
          </Link>
        ))}
      </Tabs>
      {!data || data.kols.length === 0 ? (
        <EmptyState title="No KOLs yet" />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink text-left text-xs tracking-[0.08em] text-ink-3 uppercase">
              <th className="py-2 font-medium">KOL</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">Live</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">Markets</th>
              <th className="py-2 text-right font-medium">Record</th>
            </tr>
          </thead>
          <tbody>
            {data.kols.map((k) => (
              <tr key={k.id} className="border-b border-rule">
                <td className="py-3">
                  <Link href={`/kol/${k.handle}`} className="flex items-center gap-3">
                    <Avatar src={k.avatarUrl} handle={k.handle} size={32} />
                    <span>
                      <span className="block font-medium text-ink">@{k.handle}</span>
                      <span className="block text-xs text-ink-3">{k.name}</span>
                    </span>
                  </Link>
                </td>
                <td className="hidden py-3 text-right font-mono sm:table-cell">{k.stats?.live ?? 0}</td>
                <td className="hidden py-3 text-right font-mono sm:table-cell">{k.markets}</td>
                <td className="py-3 text-right">
                  <HitRate rate={k.stats?.hitRate ?? null} n={k.stats?.resolved ?? 0} />
                  <br />
                  <EdgeBadge avgEdge={k.stats?.avgEdge ?? null} n={k.stats?.edgeN ?? 0} className="text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
