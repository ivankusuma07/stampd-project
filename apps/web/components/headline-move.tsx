"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { SplitFlapText, Avatar, Change } from "@stampd/ui";
import { formatCents } from "@stampd/core";
import { api } from "@/lib/api";
import type { Market } from "@/lib/types";
import { PriceChart } from "./price-chart";

/**
 * Home headline (development plan 1.6 #1): the day's biggest move — serif question, the move
 * highlighted ("56¢ → 71¢") with the new price flipping in on a split-flap, the chart, and the
 * KOL's quoted post underneath.
 */
export function HeadlineMove({ initial, post }: { initial: Market; post: { text: string; url: string } | null }) {
  const { data: m } = useQuery({
    queryKey: ["market-headline", initial.id],
    queryFn: () => api<{ market: Market }>(`/markets/${initial.id}`).then((r) => r.market),
    initialData: initial,
    refetchInterval: 15_000,
  });
  const change = m.change24hBps ?? 0;
  const before = m.yesPriceBps - change;
  const cents = String(Math.round(m.yesPriceBps / 100)).padStart(2, " ");

  return (
    <article>
      <p className="text-xs tracking-[0.12em] text-ink-3 uppercase">Biggest move · 24h</p>
      <Link href={`/markets/${m.id}`} className="mt-2 block text-ink">
        <h1 className="font-serif text-3xl leading-[1.15] font-semibold md:text-4xl">{m.question}</h1>
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="font-mono text-lg">
          <span className="mark">
            YES {formatCents(before)} → {formatCents(m.yesPriceBps)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 font-mono" aria-live="polite">
          <SplitFlapText value={cents} fontSize={34} />
          <span className="text-2xl">¢</span>
        </span>
        <Change bps={change} className="text-base" />
      </div>
      <div className="mt-5">
        <PriceChart marketId={m.id} height={240} />
      </div>
      {post ? (
        <blockquote className="mt-4 border-l-2 border-ink pl-3">
          <p className="flex items-center gap-2 text-xs text-ink-3">
            <Avatar src={m.kol.avatarUrl} handle={m.kol.handle} size={20} />@{m.kol.handle} on X
          </p>
          <p className="mt-1 font-serif text-lg text-ink-2">{post.text}</p>
          <a href={post.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-ink-3 underline">
            View post
          </a>
        </blockquote>
      ) : null}
    </article>
  );
}
