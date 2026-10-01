import Link from "next/link";
import { Avatar, EdgeBadge, EmptyState, FadeContent, HitRate, SectionHeading, Tabs, tabClass } from "@stampd/ui";
import { CATEGORIES } from "@stampd/core";
import { serverGet } from "@/lib/api";
import type { Insights, KolListItem, Market, MarketDetail } from "@/lib/types";
import { Hero } from "@/components/hero";
import { FeaturedMarket } from "@/components/featured-market";
import { MarketGrid } from "@/components/market-grid";
import { MiniReceipt } from "@/components/receipt";
import { HowItWorks } from "@/components/how-it-works";
import { ArrowRight } from "lucide-react";

export const revalidate = 15;

type Search = Promise<{ category?: string; feed?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const { category, feed } = await searchParams;
  const boardQuery = new URLSearchParams({ status: "open", sort: feed === "trending" ? "trending" : "volume", limit: "12" });
  if (category) boardQuery.set("category", category);

  const [insights, moves, board, resolved, kols] = await Promise.all([
    serverGet<Insights>("/insights", 60),
    serverGet<{ markets: Market[] }>("/markets/moves?limit=6"),
    serverGet<{ markets: Market[] }>(`/markets?${boardQuery}`),
    serverGet<{ markets: Market[] }>("/markets?status=resolved&sort=new&limit=6"),
    serverGet<{ kols: KolListItem[] }>("/kols?sort=live&limit=6"),
  ]);
  const apiDown = !insights && !board && !kols;
  // The headline is the biggest 24h mover; with no moves yet, the most traded open market.
  const featured = moves?.markets[0] ?? board?.markets[0];
  const featuredDetail = featured ? await serverGet<MarketDetail>(`/markets/${featured.id}`) : null;
  const others = (moves?.markets ?? []).filter((m) => m.id !== featured?.id).slice(0, 4);

  return (
    <div className="space-y-24">
      <Hero insights={insights} />

      {apiDown ? (
        <EmptyState title="Market data is unavailable right now">
          The STAMPD API isn&apos;t answering. Nothing below would be real, so nothing is shown.
        </EmptyState>
      ) : null}

      {featured ? (
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <FeaturedMarket
              initial={featured}
              post={featuredDetail?.post ? { text: featuredDetail.post.text, url: featuredDetail.post.url } : null}
            />
          </div>
          <aside className="lg:col-span-4">
            <SectionHeading eyebrow="Momentum">Moves today</SectionHeading>
            {others.length > 0 ? (
              <MarketGrid initial={others} query="" compact />
            ) : (
              <p className="rounded-2xl border border-dashed border-rule-strong p-5 text-sm text-ink-2">
                Other movers show up here as markets trade.
              </p>
            )}
          </aside>
        </section>
      ) : null}

      <section>
        <SectionHeading eyebrow="Live markets" aside={<Link href="/markets" className="inline-flex items-center gap-1">All markets <ArrowRight size={14} aria-hidden /></Link>}>
          Market board
        </SectionHeading>
        <Tabs label="Categories">
          <Link href="/" className={tabClass(!category && feed !== "trending")} scroll={false}>
            All
          </Link>
          <Link href="/?feed=trending" className={tabClass(feed === "trending" && !category)} scroll={false}>
            Trending
          </Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/?category=${c}`} className={`${tabClass(category === c)} capitalize`} scroll={false}>
              {c}
            </Link>
          ))}
        </Tabs>
        <div className="mt-5">
          <MarketGrid initial={board?.markets ?? []} query={boardQuery.toString()} empty="No open markets in this category yet" />
        </div>
      </section>

      <section>
        <SectionHeading eyebrow="How it works">From a post on X to a receipt onchain</SectionHeading>
        <HowItWorks />
      </section>

      <section>
        <SectionHeading eyebrow="Receipts" aside={<Link href="/markets?status=resolved" className="inline-flex items-center gap-1">All results <ArrowRight size={14} aria-hidden /></Link>}>
          Just resolved
        </SectionHeading>
        {resolved && resolved.markets.length > 0 ? (
          <FadeContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resolved.markets.map((m) => (
              <MiniReceipt key={m.id} market={m} />
            ))}
          </FadeContent>
        ) : (
          <EmptyState title="No resolved calls yet">Receipts land here, stamped CALLED IT or MISSED, as markets settle.</EmptyState>
        )}
      </section>

      <section>
        <SectionHeading eyebrow="Track records" aside={<Link href="/kols" className="inline-flex items-center gap-1">All KOLs <ArrowRight size={14} aria-hidden /></Link>}>
          KOLs by activity
        </SectionHeading>
        {kols && kols.kols.length > 0 ? (
          <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {kols.kols.map((k, i) => (
              <li key={k.id}>
                <Link
                  href={`/kol/${k.handle}`}
                  className="group flex items-center gap-4 rounded-2xl border border-rule bg-surface/70 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:border-brand/40"
                >
                  <span className="w-7 font-display text-xl font-extrabold text-ink-3 group-hover:text-accent">{i + 1}</span>
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
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No KOLs tracked yet" />
        )}
      </section>

      <section className="relative overflow-hidden rounded-3xl border border-brand/30 bg-surface/80 px-6 py-14 text-center backdrop-blur md:px-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" />
        <h2 className="relative font-display text-3xl font-extrabold text-ink md:text-4xl">
          Saw a bold call? <span className="text-gradient">Put it on the record.</span>
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-ink-2">
          Paste a link to a post on X. If it&apos;s a dated, checkable prediction, it becomes a market, and you get the credit.
        </p>
        <div className="relative mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/submit" className="inline-flex h-12 items-center rounded-full bg-brand px-7 text-sm font-semibold text-brand-ink shadow-[0_8px_30px_-8px_var(--brand)] hover:brightness-110">
            Submit a call
          </Link>
          <Link href="/faucet" className="inline-flex h-12 items-center rounded-full border border-rule-strong px-7 text-sm font-semibold text-ink hover:border-brand/50">
            Get demo USD
          </Link>
        </div>
      </section>
    </div>
  );
}
