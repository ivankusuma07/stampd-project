"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Change, ElectricBorder, ProbabilityBar, SplitFlapText, useCalm } from "@stampd/ui";
import { formatCents } from "@stampd/core";
import { api } from "@/lib/api";
import type { Market } from "@/lib/types";
import { usd } from "@/lib/format";
import { PriceChart } from "./price-chart";
import { RelativeTime } from "./relative-time";
import { ArrowUpRight } from "lucide-react";

/**
 * The day's biggest move, framed in an electric border: the new price flips in on a split-flap,
 * with the move, the odds bar, a chart and one-tap YES/NO.
 */
export function FeaturedMarket({ initial, post }: { initial: Market; post: { text: string; url: string } | null }) {
  const calm = useCalm();
  const { data: m } = useQuery({
    queryKey: ["market-featured", initial.id],
    queryFn: () => api<{ market: Market }>(`/markets/${initial.id}`).then((r) => r.market),
    initialData: initial,
    refetchInterval: 15_000,
  });
  const change = m.change24hBps ?? 0;
  const cents = String(Math.round(m.yesPriceBps / 100)).padStart(2, " ");

  const card = (
    <div className="rounded-[22px] bg-surface/95 p-6 backdrop-blur md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-brand px-3 py-1 text-[11px] font-bold tracking-[0.18em] text-brand-ink">BIGGEST MOVE · 24H</span>
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <Avatar src={m.kol.avatarUrl} handle={m.kol.handle} size={22} />@{m.kol.handle}
        </span>
        <span className="ml-auto font-mono text-xs text-ink-3">
          <RelativeTime iso={m.closeTime} mode="until" /> left
        </span>
      </div>

      <Link href={`/markets/${m.id}`} className="mt-5 block">
        <h2 className="font-display text-2xl leading-tight font-bold text-ink hover:text-accent md:text-3xl">{m.question}</h2>
      </Link>

      <div className="mt-6 grid gap-6 md:grid-cols-[auto_1fr] md:items-end">
        <div>
          <div className="text-[11px] font-bold tracking-[0.2em] text-yes">YES PRICE</div>
          <div className="mt-1 flex items-center gap-1 font-mono" aria-live="polite">
            <SplitFlapText value={cents} fontSize={48} />
            <span className="text-4xl text-ink-2">¢</span>
          </div>
          <div className="mt-2 flex items-center gap-3 font-mono text-sm">
            <span className="text-ink-3">
              from {formatCents(m.yesPriceBps - change)}
            </span>
            <Change bps={change} className="text-base" />
          </div>
        </div>
        <div className="space-y-3">
          <ProbabilityBar yesBps={m.yesPriceBps} thick />
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={`/markets/${m.id}`}
              className="glow-yes flex items-center justify-between rounded-xl border border-yes/40 bg-yes-bg px-4 py-3 font-mono text-yes transition hover:brightness-125"
            >
              <span className="text-xs font-bold tracking-widest">BUY YES</span>
              <span className="text-lg">{formatCents(m.yesPriceBps)}</span>
            </Link>
            <Link
              href={`/markets/${m.id}`}
              className="glow-no flex items-center justify-between rounded-xl border border-no/40 bg-no-bg px-4 py-3 font-mono text-no transition hover:brightness-125"
            >
              <span className="text-xs font-bold tracking-widest">BUY NO</span>
              <span className="text-lg">{formatCents(10_000 - m.yesPriceBps)}</span>
            </Link>
          </div>
          <p className="text-right font-mono text-xs text-ink-3">{usd(m.volume)} volume · {m.tradeCount} trades</p>
        </div>
      </div>

      <div className="mt-6">
        <PriceChart marketId={m.id} height={200} until={m.closeTime} />
      </div>

      {post ? (
        <blockquote className="mt-5 rounded-xl border border-rule bg-surface-2/60 p-4">
          <p className="text-xs text-ink-3">@{m.kol.handle} on X</p>
          <p className="mt-1 text-ink-2">“{post.text}”</p>
          <a href={post.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-accent hover:underline items-center gap-1">
            View the original post <ArrowUpRight size={12} aria-hidden />
          </a>
        </blockquote>
      ) : null}
    </div>
  );

  return calm ? (
    <div className="rounded-3xl border border-brand/40">{card}</div>
  ) : (
    <ElectricBorder color="#c8ff2e" speed={0.45} chaos={0.1} borderRadius={24}>
      {card}
    </ElectricBorder>
  );
}
