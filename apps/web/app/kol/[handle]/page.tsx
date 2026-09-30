import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, EdgeBadge, EmptyState, HitRate, SectionHeading } from "@stampd/ui";
import { serverGet } from "@/lib/api";
import type { KolStats, Market } from "@/lib/types";
import { MarketGrid } from "@/components/market-grid";
import { MiniReceipt } from "@/components/receipt";
import { FollowButton } from "@/components/follow-button";
import { ArrowUpRight } from "lucide-react";

type Params = Promise<{ handle: string }>;
type Profile = {
  kol: { id: string; handle: string; name: string; avatarUrl: string | null; stats: KolStats | null; followers: number };
  following: boolean;
  markets: Market[];
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle}`, description: `Every call by @${handle} on STAMPD, with its receipt.` };
}

export default async function KolPage({ params }: { params: Params }) {
  const { handle } = await params;
  const data = await serverGet<Profile>(`/kols/${encodeURIComponent(handle)}`);
  if (!data) notFound();
  const { kol, markets } = data;
  const live = markets.filter((m) => m.status === "OPEN" || m.status === "CLOSED" || m.status === "PROPOSED" || m.status === "DISPUTED");
  const resolved = markets.filter((m) => m.status === "RESOLVED");
  const s = kol.stats;

  return (
    <div className="space-y-14">
      <header className="relative overflow-hidden rounded-3xl border border-rule bg-surface/80 p-6 backdrop-blur md:p-10">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-24 h-80 w-80 rounded-full bg-brand/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-40 h-80 w-80 rounded-full bg-brand-2/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div className="rounded-full bg-[conic-gradient(from_180deg,var(--brand),var(--brand-3),var(--brand-2),var(--brand))] p-[3px] shadow-[0_0_40px_-8px_var(--brand)]">
            <div className="rounded-full bg-paper p-1">
              <Avatar src={kol.avatarUrl} handle={kol.handle} size={88} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Track record</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink md:text-5xl">@{kol.handle}</h1>
            <p className="mt-1 text-ink-2">
              {kol.name} ·{" "}
              <a href={`https://x.com/${kol.handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                Profile on X <ArrowUpRight size={14} aria-hidden />
              </a>
            </p>
          </div>
          <FollowButton kolId={kol.id} initial={data.following} />
        </div>
        <dl className="relative mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          {(
            [
              ["Hit rate", <HitRate key="h" rate={s?.hitRate ?? null} n={s?.resolved ?? 0} />],
              ["Edge", <EdgeBadge key="e" avgEdge={s?.avgEdge ?? null} n={s?.edgeN ?? 0} />],
              ["Live calls", <span key="l" className="font-display text-2xl font-bold text-ink">{live.length}</span>],
              ["Void", <span key="v" className="font-display text-2xl font-bold text-ink">{s?.invalid ?? 0}</span>],
              ["Followers", <span key="f" className="font-display text-2xl font-bold text-ink">{kol.followers}</span>],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-rule bg-surface-2/60 px-4 py-3">
              <dt className="text-[10px] tracking-[0.2em] text-ink-3 uppercase">{label}</dt>
              <dd className="mt-1">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section>
        <SectionHeading eyebrow="Open markets">Live calls</SectionHeading>
        <MarketGrid initial={live} query="" empty="No live calls right now" />
      </section>

      <section>
        <SectionHeading eyebrow="Receipts">Resolved calls</SectionHeading>
        {resolved.length === 0 ? (
          <EmptyState title="Nothing resolved yet">A track record builds as calls reach their deadlines.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resolved.map((m) => (
              <MiniReceipt key={m.id} market={m} />
            ))}
          </div>
        )}
      </section>
      <p className="text-xs text-ink-3">
        Is this you and you&apos;d rather not be listed? <Link href="/takedown" className="text-accent hover:underline">Request a review</Link>.
      </p>
    </div>
  );
}
