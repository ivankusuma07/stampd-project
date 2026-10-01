import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, EmptyState, LiveDot, Pill, PriceChip, ProbabilityRing, SectionHeading } from "@stampd/ui";
import { formatCents, formatDateTimeUtc, formatDateUtc, shortHash } from "@stampd/core";
import { explorerTxUrl } from "@stampd/chain";
import { serverGet } from "@/lib/api";
import type { MarketDetail, Trade } from "@/lib/types";
import { STATUS_LABEL, displayName, usd } from "@/lib/format";
import { PriceChart } from "@/components/price-chart";
import { TradePanel } from "@/components/trade-panel";
import { Activity, PositionBox, ResolutionPanel, ShareReceipt, WatchFlag } from "@/components/market-side";
import { MarketCallouts } from "@/components/callouts";
import { RelativeTime } from "@/components/relative-time";
import { ArrowUpRight } from "lucide-react";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const d = await serverGet<MarketDetail>(`/markets/${id}`);
  if (!d) return { title: "Market not found" };
  const m = d.market;
  const summary = m.result ? `Resolved ${m.result}` : `YES ${formatCents(m.yesPriceBps)} · closes ${formatDateUtc(m.closeTime)}`;
  return { title: m.question, description: `@${m.kol.handle}'s call. ${summary}.` };
}

export default async function MarketPage({ params }: { params: Params }) {
  const { id } = await params;
  const [detail, trades] = await Promise.all([
    serverGet<MarketDetail>(`/markets/${id}`, 5),
    serverGet<{ trades: Trade[] }>(`/markets/${id}/trades?limit=30`, 5),
  ]);
  if (!detail) notFound();
  const { market: m, post, submitter } = detail;
  const r = m.spec?.resolution;
  const createUrl = m.createTxHash ? explorerTxUrl(m.chainId, m.createTxHash) : null;

  return (
    // Phones: question → trade panel → details. Desktop: 8/4 columns with a sticky trade panel.
    <div className="grid gap-8 lg:grid-cols-12">
      <div className="space-y-8 lg:col-span-8 lg:row-start-1">
        <header className="relative overflow-hidden rounded-3xl border border-rule bg-surface/80 p-6 backdrop-blur md:p-8">
          <div aria-hidden className="pointer-events-none absolute -top-32 -right-20 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-brand-2/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/kol/${m.kol.handle}`} className="inline-flex items-center gap-2 rounded-full border border-rule bg-surface-2/70 py-1 pr-3 pl-1 text-ink hover:border-brand/40">
              <Avatar src={m.kol.avatarUrl} handle={m.kol.handle} size={24} />@{m.kol.handle}
            </Link>
            <Pill className="capitalize">{m.category}</Pill>
            <Pill>
              {m.status === "OPEN" ? <LiveDot /> : null}
              {m.result ? `Resolved ${m.result}` : STATUS_LABEL[m.status]}
            </Pill>
            {m.status === "OPEN" ? (
              <Pill className="font-mono">
                closes in <RelativeTime iso={m.closeTime} mode="until" />
              </Pill>
            ) : null}
          </div>
          <div className="relative mt-6 grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h1 className="font-display text-2xl leading-tight font-bold text-ink md:text-4xl">{m.question}</h1>
              <p className="mt-4 text-sm text-ink-2">
                @{m.kol.handle} called{" "}
                <strong className={`rounded-md px-1.5 py-0.5 font-mono ${m.kolSide === "YES" ? "bg-yes-bg text-yes" : "bg-no-bg text-no"}`}>{m.kolSide}</strong>
                {submitter ? <span className="text-ink-3"> · submitted by {displayName(submitter)}</span> : null}
              </p>
              <dl className="mt-5 grid max-w-md grid-cols-3 gap-3">
                {[
                  ["Volume", usd(m.volume, { compact: true })],
                  ["Trades", String(m.tradeCount)],
                  ["Opened at", `${Math.round(m.openingYesPriceBps / 100)}¢`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-rule bg-surface-2/60 px-3 py-2">
                    <dt className="text-[10px] tracking-[0.2em] text-ink-3 uppercase">{k}</dt>
                    <dd className="font-mono text-sm text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex items-center gap-5 md:flex-col md:gap-3">
              <ProbabilityRing yesBps={m.result ? (m.result === "YES" ? 10_000 : m.result === "NO" ? 0 : 5_000) : m.yesPriceBps} />
              <div className="flex gap-2 md:justify-center">
                <PriceChip side="YES" bps={m.yesPriceBps} />
                <PriceChip side="NO" bps={10_000 - m.yesPriceBps} />
              </div>
            </div>
          </div>
        </header>
      </div>

      <aside className="lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
        <div className="space-y-4 lg:sticky lg:top-24">
          {m.status === "RESOLVED" ? null : <TradePanel market={m} />}
          <PositionBox market={m} />
          <ShareReceipt market={m} postedAt={post?.postedAt} />
          <WatchFlag market={m} watching={detail.viewer?.watching ?? false} />
          {m.status === "PENDING" ? <EmptyState title="Not live yet" /> : null}
        </div>
      </aside>

      <div className="space-y-8 lg:col-span-8 lg:row-start-2">

        {post ? (
          <blockquote className="rounded-2xl border border-rule bg-surface/70 p-5 backdrop-blur">
            <div className="mb-2 flex items-center gap-2 text-xs text-ink-3">
              <Avatar src={m.kol.avatarUrl} handle={post.authorHandle} size={20} />
              <span className="font-semibold text-ink-2">@{post.authorHandle}</span> on X · {formatDateTimeUtc(post.postedAt)}
            </div>
            <p className="text-lg leading-snug text-ink">“{post.text}”</p>
            <a href={post.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs text-accent hover:underline items-center gap-1">
              View the original post <ArrowUpRight size={12} aria-hidden />
            </a>
          </blockquote>
        ) : (
          <p className="text-sm text-ink-3">
            <a href={m.sourcePostUrl} target="_blank" rel="noreferrer" className="underline">
              Source post on X
            </a>{" "}
            (text not stored)
          </p>
        )}

        <div className="rounded-2xl border border-rule bg-surface/70 p-5 backdrop-blur">
          <PriceChart marketId={m.id} until={m.settledAt ?? m.closeTime} />
        </div>

        <section className="rounded-2xl border border-rule bg-surface/70 p-6 backdrop-blur">
          <SectionHeading eyebrow="Settlement">Rules</SectionHeading>
          <p className="max-w-prose text-ink">{m.rules}</p>
          <dl className="mt-4 grid gap-x-6 gap-y-2 font-mono text-sm sm:grid-cols-2">
            {r ? (
              <>
                <div>
                  <dt className="text-xs text-ink-3 uppercase">Data source</dt>
                  <dd>{r.source}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3 uppercase">Condition</dt>
                  <dd>
                    {r.subject} {r.metric} {r.comparator} {r.threshold}
                  </dd>
                </div>
              </>
            ) : null}
            <div>
              <dt className="text-xs text-ink-3 uppercase">Trading closes</dt>
              <dd>{formatDateTimeUtc(m.closeTime)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3 uppercase">Resolve by</dt>
              <dd>{formatDateTimeUtc(m.resolveBy)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3 uppercase">Rules hash (onchain)</dt>
              <dd title={m.questionHash}>{shortHash(m.questionHash, 10, 6)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3 uppercase">Created</dt>
              <dd>
                {createUrl ? (
                  <a href={createUrl} target="_blank" rel="noreferrer" className="underline">
                    tx {shortHash(m.createTxHash!)}
                  </a>
                ) : m.createTxHash ? (
                  `tx ${shortHash(m.createTxHash)}`
                ) : (
                  "-"
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-3">
            The rules above hash to the value stored onchain when the market opened, so they can&apos;t be edited afterwards.
            {m.specUri?.startsWith("ipfs://") ? ` Full rules: ${m.specUri}` : ""}
          </p>
        </section>

        {m.resolution || m.status !== "OPEN" ? (
          <section>
            <SectionHeading>Resolution</SectionHeading>
            <ResolutionPanel market={m} />
          </section>
        ) : null}

        <section className="rounded-2xl border border-rule bg-surface/70 p-6 backdrop-blur">
          <SectionHeading eyebrow="Onchain">Activity</SectionHeading>
          <Activity marketId={m.id} initial={trades?.trades ?? []} />
        </section>

        <section className="rounded-2xl border border-rule bg-surface/70 p-6 backdrop-blur">
          <SectionHeading eyebrow="Community">Callouts</SectionHeading>
          <MarketCallouts marketId={m.id} kolSide={m.kolSide} />
        </section>
      </div>
    </div>
  );
}
