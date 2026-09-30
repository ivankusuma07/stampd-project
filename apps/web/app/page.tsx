import Link from "next/link";
import { Avatar, Change, EdgeBadge, EmptyState, FadeContent, HitRate, SectionHeading, Tabs, tabClass } from "@stampd/ui";
import { CATEGORIES, formatCents } from "@stampd/core";
import { serverGet } from "@/lib/api";
import type { KolListItem, Market, MarketDetail } from "@/lib/types";
import { MarketTable } from "@/components/market-table";
import { HeadlineMove } from "@/components/headline-move";
import { MiniReceipt } from "@/components/receipt";

export const revalidate = 15;

type Search = Promise<{ category?: string; feed?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const { category, feed } = await searchParams;
  const tableQuery = new URLSearchParams({ status: "open", sort: feed === "trending" ? "trending" : "volume", limit: "30" });
  if (category) tableQuery.set("category", category);

  const [moves, table, resolved, kols] = await Promise.all([
    serverGet<{ markets: Market[] }>("/markets/moves?limit=6"),
    serverGet<{ markets: Market[] }>(`/markets?${tableQuery}`),
    serverGet<{ markets: Market[] }>("/markets?status=resolved&sort=new&limit=6"),
    serverGet<{ kols: KolListItem[] }>("/kols?sort=live&limit=8"),
  ]);
  const apiDown = !moves && !table && !kols;
  const headline = moves?.markets[0];
  const headlineDetail = headline ? await serverGet<MarketDetail>(`/markets/${headline.id}`) : null;

  return (
    <div className="space-y-12">
      {apiDown ? (
        <EmptyState title="Market data is unavailable right now">
          The STAMPD API isn&apos;t answering. Nothing below would be real, so nothing is shown.
        </EmptyState>
      ) : null}

      <section className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {headline ? (
            <HeadlineMove initial={headline} post={headlineDetail?.post ? { text: headlineDetail.post.text, url: headlineDetail.post.url } : null} />
          ) : (
            <div>
              <p className="text-xs tracking-[0.12em] text-ink-3 uppercase">Every call gets a receipt</p>
              <h1 className="mt-2 max-w-2xl font-serif text-4xl leading-[1.15] font-semibold">
                Crypto calls from X, turned into markets and settled onchain.
              </h1>
              <p className="mt-3 max-w-xl text-ink-2">
                When a KOL posts a dated, checkable call, it becomes a YES/NO market on Robinhood Chain. The price is the
                crowd&apos;s odds; the result is written onchain with its evidence. Demo money only.
              </p>
              <p className="mt-4 text-sm text-ink-3">No price has moved in the last 24 hours yet.</p>
            </div>
          )}
        </div>
        <aside className="lg:col-span-4">
          <SectionHeading>Moves today</SectionHeading>
          {moves && moves.markets.length > 1 ? (
            <ol className="divide-y divide-rule">
              {moves.markets.slice(1).map((m) => (
                <li key={m.id} className="py-3">
                  <Link href={`/markets/${m.id}`} className="block font-serif text-base leading-snug text-ink">
                    {m.question}
                  </Link>
                  <p className="mt-1 flex items-center gap-2 font-mono text-sm">
                    <span className="text-ink-2">YES {formatCents(m.yesPriceBps)}</span>
                    <Change bps={m.change24hBps} />
                    <span className="ml-auto text-xs text-ink-3">@{m.kol.handle}</span>
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-3 text-sm text-ink-2">Other movers appear here once markets trade.</p>
          )}
        </aside>
      </section>

      <section>
        <SectionHeading aside={<Link href="/markets">All markets</Link>}>Market board</SectionHeading>
        <Tabs label="Categories">
          <Link href="/" className={tabClass(!category && feed !== "trending")}>
            All
          </Link>
          <Link href="/?feed=trending" className={tabClass(feed === "trending" && !category)}>
            Trending
          </Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/?category=${c}`} className={`${tabClass(category === c)} capitalize`}>
              {c}
            </Link>
          ))}
        </Tabs>
        <div className="mt-2">
          <MarketTable initial={table?.markets ?? []} query={tableQuery.toString()} empty="No open markets in this category" />
        </div>
      </section>

      <section>
        <SectionHeading>Just resolved</SectionHeading>
        {resolved && resolved.markets.length > 0 ? (
          <FadeContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resolved.markets.map((m) => (
              <MiniReceipt key={m.id} market={m} />
            ))}
          </FadeContent>
        ) : (
          <EmptyState title="No resolved calls yet">Receipts appear here as markets settle.</EmptyState>
        )}
      </section>

      <section>
        <SectionHeading aside={<Link href="/kols">All KOLs</Link>}>KOLs by activity</SectionHeading>
        {kols && kols.kols.length > 0 ? (
          <ul className="grid gap-x-8 md:grid-cols-2">
            {kols.kols.map((k) => (
              <li key={k.id} className="flex items-center gap-3 border-b border-rule py-3">
                <Avatar src={k.avatarUrl} handle={k.handle} size={32} />
                <div className="min-w-0 flex-1">
                  <Link href={`/kol/${k.handle}`} className="font-medium">
                    @{k.handle}
                  </Link>
                  <p className="text-xs text-ink-3">
                    {k.stats?.live ?? 0} live · {k.markets} markets
                  </p>
                </div>
                <div className="text-right">
                  <HitRate rate={k.stats?.hitRate ?? null} n={k.stats?.resolved ?? 0} />
                  <br />
                  <EdgeBadge avgEdge={k.stats?.avgEdge ?? null} n={k.stats?.edgeN ?? 0} className="text-xs" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No KOLs tracked yet" />
        )}
      </section>
    </div>
  );
}
