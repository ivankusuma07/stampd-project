"use client";

import Link from "next/link";
import { Avatar, Change, ProbabilityBar, SpotlightCard } from "@stampd/ui";
import { formatDateUtc } from "@stampd/core";
import type { Market } from "@/lib/types";
import { STATUS_LABEL, usd } from "@/lib/format";
import { LivePrice } from "./live-price";
import { RelativeTime } from "./relative-time";

/** Market card for grids: KOL, question, live YES odds, split bar, volume and time left. */
export function MarketCard({ m }: { m: Market }) {
  const open = m.status === "OPEN";
  return (
    <SpotlightCard className="group h-full transition hover:-translate-y-0.5 hover:border-rule-strong">
      <Link href={`/markets/${m.id}`} className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Avatar src={m.kol.avatarUrl} handle={m.kol.handle} size={22} />
          <span className="font-medium text-ink-2">@{m.kol.handle}</span>
          <span className="ml-auto rounded-full border border-rule px-2 py-0.5 capitalize">{m.category}</span>
        </div>
        <h3 className="line-clamp-3 text-base leading-snug font-semibold text-ink group-hover:text-accent">{m.question}</h3>
        <div className="mt-auto space-y-2.5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-yes">YES</div>
              <div data-testid="yes-price" className="font-display text-3xl font-bold text-ink">
                <LivePrice bps={m.yesPriceBps} side="YES" height={34} />
              </div>
            </div>
            <div className="text-right">
              <Change bps={m.change24hBps} />
              <div className="font-mono text-xs text-ink-3">NO {Math.round((10_000 - m.yesPriceBps) / 100)}¢</div>
            </div>
          </div>
          <ProbabilityBar yesBps={m.yesPriceBps} />
          <div className="flex justify-between font-mono text-xs text-ink-3">
            <span>{usd(m.volume, { compact: true })} vol</span>
            <span>
              {open ? (
                <>
                  <RelativeTime iso={m.closeTime} mode="until" /> left
                </>
              ) : m.result ? (
                `Resolved ${m.result}`
              ) : (
                `${STATUS_LABEL[m.status]} · ${formatDateUtc(m.closeTime)}`
              )}
            </span>
          </div>
        </div>
      </Link>
    </SpotlightCard>
  );
}
