import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, EdgeBadge, EmptyState, HitRate, SpotlightCard, Tabs, tabClass } from "@stampd/ui";
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

  const kols = data?.kols ?? [];
  const podium = kols.slice(0, 3);
  const rest = kols.slice(3);

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-3xl border border-rule bg-surface/80 p-6 backdrop-blur md:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-32 -left-16 h-72 w-72 rounded-full bg-brand-2/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-40 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">KOLs leaderboard</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight md:text-5xl">
            Who actually <span className="text-gradient">calls it?</span>
          </h1>
          <p className="mt-3 max-w-2xl text-ink-2">
            Accounts whose calls become markets. <strong className="text-ink">Hit rate</strong> counts calls that resolved their way.{" "}
            <strong className="text-ink">Edge</strong> measures how much they beat the crowd&apos;s odds (
            <Link href="/insights#method" className="text-accent hover:underline">
              how it&apos;s computed
            </Link>
            ).
          </p>
          <div className="mt-6">
            <Tabs label="Sort KOLs">
              {SORTS.map(([k, label]) => (
                <Link key={k} href={`/kols?sort=${k}`} className={tabClass(sort === k)}>
                  {label}
                </Link>
              ))}
            </Tabs>
          </div>
        </div>
      </header>

      {kols.length === 0 ? (
        <EmptyState title="No KOLs yet" />
      ) : (
        <>
          <ol className="grid gap-4 md:grid-cols-3" aria-label="Top three">
            {podium.map((k, i) => (
              <li key={k.id}>
                <Link
                  href={`/kol/${k.handle}`}
                  className={`group relative flex h-full flex-col items-center overflow-hidden rounded-3xl border bg-surface/80 p-6 text-center backdrop-blur transition hover:-translate-y-1 ${i === 0 ? "border-brand/50 glow" : "border-rule hover:border-brand/40"}`}
                >
                  <div aria-hidden className={`pointer-events-none absolute -top-20 h-40 w-40 rounded-full blur-3xl ${i === 0 ? "bg-brand/25" : i === 1 ? "bg-brand-3/20" : "bg-brand-2/20"}`} />
                  <span className={`relative font-display text-5xl font-extrabold ${i === 0 ? "text-accent" : "text-ink-3"}`}>#{i + 1}</span>
                  <div className="relative mt-4 rounded-full bg-[conic-gradient(from_180deg,var(--brand),var(--brand-3),var(--brand-2),var(--brand))] p-[2px]">
                    <div className="rounded-full bg-paper p-1">
                      <Avatar src={k.avatarUrl} handle={k.handle} size={64} />
                    </div>
                  </div>
                  <p className="relative mt-3 max-w-full truncate font-display text-lg font-bold text-ink">@{k.handle}</p>
                  <p className="relative max-w-full truncate text-xs text-ink-3">{k.name}</p>
                  <div className="relative mt-5 grid w-full grid-cols-2 gap-2 text-left">
                    <Stat label="Hit rate">
                      <HitRate rate={k.stats?.hitRate ?? null} n={k.stats?.resolved ?? 0} />
                    </Stat>
                    <Stat label="Edge">
                      <EdgeBadge avgEdge={k.stats?.avgEdge ?? null} n={k.stats?.edgeN ?? 0} />
                    </Stat>
                    <Stat label="Live">
                      <span className="font-mono text-ink">{k.stats?.live ?? 0}</span>
                    </Stat>
                    <Stat label="Markets">
                      <span className="font-mono text-ink">{k.markets}</span>
                    </Stat>
                  </div>
                </Link>
              </li>
            ))}
          </ol>

          {rest.length > 0 ? (
            <ol start={4} className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((k, i) => (
                <li key={k.id}>
                  <SpotlightCard className="p-0!">
                    <Link href={`/kol/${k.handle}`} className="group flex items-center gap-4 p-4">
                      <span className="w-8 font-display text-xl font-extrabold text-ink-3 group-hover:text-accent">{i + 4}</span>
                      <Avatar src={k.avatarUrl} handle={k.handle} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">@{k.handle}</p>
                        <p className="text-xs text-ink-3">
                          {k.stats?.live ?? 0} live · {k.markets} markets
                        </p>
                      </div>
                      <div className="text-right">
                        <HitRate rate={k.stats?.hitRate ?? null} n={k.stats?.resolved ?? 0} className="text-xs" />
                        <br />
                        <EdgeBadge avgEdge={k.stats?.avgEdge ?? null} n={k.stats?.edgeN ?? 0} className="text-xs" />
                      </div>
                    </Link>
                  </SpotlightCard>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-rule bg-surface-2/60 px-3 py-2">
      <div className="text-[10px] tracking-[0.2em] text-ink-3 uppercase">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
