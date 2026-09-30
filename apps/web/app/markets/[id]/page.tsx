import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, EmptyState, SectionHeading } from "@stampd/ui";
import { formatCents, formatCountdown, formatDateTimeUtc, formatDateUtc, shortHash } from "@stampd/core";
import { explorerTxUrl } from "@stampd/chain";
import { serverGet } from "@/lib/api";
import type { MarketDetail, Trade } from "@/lib/types";
import { STATUS_LABEL, displayName, usd } from "@/lib/format";
import { PriceChart } from "@/components/price-chart";
import { TradePanel } from "@/components/trade-panel";
import { Activity, PositionBox, ResolutionPanel, ShareReceipt, WatchFlag } from "@/components/market-side";
import { MarketCallouts } from "@/components/callouts";

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
        <header>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <Avatar src={m.kol.avatarUrl} handle={m.kol.handle} size={24} />
            <Link href={`/kol/${m.kol.handle}`} className="text-ink">
              @{m.kol.handle}
            </Link>
            <span aria-hidden>·</span>
            <span className="capitalize">{m.category}</span>
            <span aria-hidden>·</span>
            <span>{m.result ? `Resolved ${m.result}` : STATUS_LABEL[m.status]}</span>
            {m.status === "OPEN" ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-mono">closes in {formatCountdown(m.closeTime)}</span>
              </>
            ) : null}
          </p>
          <h1 className="mt-3 font-serif text-3xl leading-[1.15] font-semibold md:text-4xl">{m.question}</h1>
          <p className="mt-3 font-mono text-sm text-ink-2">
            {m.kol.handle} called <strong className={m.kolSide === "YES" ? "text-yes" : "text-no"}>{m.kolSide}</strong> ·{" "}
            {usd(m.volume)} volume · {m.tradeCount} trades
          </p>
          {submitter ? <p className="mt-1 text-sm text-ink-3">Submitted by {displayName(submitter)}</p> : null}
        </header>
      </div>

      <aside className="lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
        <div className="space-y-4 lg:sticky lg:top-4">
          {m.status === "RESOLVED" ? null : <TradePanel market={m} />}
          <PositionBox market={m} />
          <ShareReceipt market={m} postedAt={post?.postedAt} />
          <WatchFlag market={m} watching={detail.viewer?.watching ?? false} />
          {m.status === "PENDING" ? <EmptyState title="Not live yet" /> : null}
        </div>
      </aside>

      <div className="space-y-8 lg:col-span-8 lg:row-start-2">

        {post ? (
          <blockquote className="border-l-2 border-ink pl-4">
            <p className="font-serif text-xl leading-snug text-ink-2">{post.text}</p>
            <footer className="mt-2 text-xs text-ink-3">
              @{post.authorHandle} on X · {formatDateTimeUtc(post.postedAt)} ·{" "}
              <a href={post.url} target="_blank" rel="noreferrer" className="underline">
                View post
              </a>
            </footer>
          </blockquote>
        ) : (
          <p className="text-sm text-ink-3">
            <a href={m.sourcePostUrl} target="_blank" rel="noreferrer" className="underline">
              Source post on X
            </a>{" "}
            (text not stored)
          </p>
        )}

        <PriceChart marketId={m.id} until={m.settledAt ?? m.closeTime} />

        <section>
          <SectionHeading>Rules</SectionHeading>
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
                  "—"
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

        <section>
          <SectionHeading>Activity</SectionHeading>
          <Activity marketId={m.id} initial={trades?.trades ?? []} />
        </section>

        <section>
          <SectionHeading>Callouts</SectionHeading>
          <MarketCallouts marketId={m.id} kolSide={m.kolSide} />
        </section>
      </div>
    </div>
  );
}
