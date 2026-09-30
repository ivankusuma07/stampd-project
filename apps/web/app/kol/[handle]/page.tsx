import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, EdgeBadge, EmptyState, HitRate, SectionHeading } from "@stampd/ui";
import { serverGet } from "@/lib/api";
import type { KolStats, Market } from "@/lib/types";
import { MarketTable } from "@/components/market-table";
import { MiniReceipt } from "@/components/receipt";
import { FollowButton } from "@/components/follow-button";

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
    <div className="space-y-10">
      <header className="flex flex-wrap items-start gap-4 border-b border-ink pb-6">
        <Avatar src={kol.avatarUrl} handle={kol.handle} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold">@{kol.handle}</h1>
          <p className="text-ink-2">{kol.name}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            <HitRate rate={s?.hitRate ?? null} n={s?.resolved ?? 0} />
            <EdgeBadge avgEdge={s?.avgEdge ?? null} n={s?.edgeN ?? 0} />
            <span className="font-mono text-sm text-ink-2">{s?.invalid ?? 0} void</span>
            <span className="font-mono text-sm text-ink-2">{kol.followers} following</span>
          </div>
          <a href={`https://x.com/${kol.handle}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-ink-3 underline">
            Profile on X
          </a>
        </div>
        <FollowButton kolId={kol.id} initial={data.following} />
      </header>

      <section>
        <SectionHeading>Live calls</SectionHeading>
        <MarketTable initial={live} query={`kol=${encodeURIComponent(kol.handle)}&status=all&sort=closing`} empty="No live calls" />
      </section>

      <section>
        <SectionHeading>Resolved calls</SectionHeading>
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
        Is this you and you&apos;d rather not be listed? <Link href="/takedown" className="underline">Request a review</Link>.
      </p>
    </div>
  );
}
