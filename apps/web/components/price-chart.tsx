"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateTimeUtc } from "@stampd/core";
import { api } from "@/lib/api";
import { tabClass } from "@stampd/ui";

type Point = { t: string; yesPriceBps: number };
const RANGES = ["1d", "1w", "1m", "all"] as const;

/** YES price over time: a glowing brand line over a fading gradient fill, mono crosshair tooltip. */
export function PriceChart({ marketId, height = 260, until }: { marketId: string; height?: number; until?: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["prices", marketId, range],
    queryFn: () => api<{ points: Point[] }>(`/markets/${marketId}/prices?range=${range}`).then((r) => r.points),
    refetchInterval: 30_000,
  });
  const points = (data ?? []).map((p) => ({ t: new Date(p.t).getTime(), cents: p.yesPriceBps / 100 }));
  // A price holds until the next trade: carry the last one to now (or to the close) so the step line
  // shows how long it has held instead of ending at the last trade.
  const last = points[points.length - 1];
  const end = Math.min(Date.now(), until ? new Date(until).getTime() : Infinity);
  if (last && end > last.t) points.push({ t: end, cents: last.cents });
  const axis = timeAxis(points);

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between">
        <figcaption className="text-xs font-semibold tracking-[0.2em] text-ink-3 uppercase">YES price</figcaption>
        <div role="tablist" aria-label="Chart range" className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={tabClass(range === r)}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height }} className="w-full">
        {points.length < 2 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-rule-strong text-sm text-ink-2">
            {isLoading ? "Loading…" : "Not enough trades to chart yet."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 24, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={`fill-${marketId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--brand)", stopOpacity: 0.35 }} />
                  <stop offset="100%" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--rule)" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={axis.domain}
                ticks={axis.ticks}
                tickFormatter={axis.format}
                stroke="var(--ink-3)"
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v: number) => `${v}¢`}
                stroke="var(--ink-3)"
                tick={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--ink-3)", strokeWidth: 1, strokeDasharray: "3 3" }}
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 12,
                  color: "var(--ink)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
                labelFormatter={(t) => formatDateTimeUtc(Number(t))}
                formatter={(v) => [`${Number(v).toFixed(1)}¢`, "YES"]}
              />
              <Area
                type="stepAfter"
                dataKey="cents"
                stroke="var(--accent)"
                strokeWidth={2}
                fill={`url(#fill-${marketId})`}
                dot={false}
                activeDot={{ r: 4, fill: "var(--accent)", stroke: "var(--paper)", strokeWidth: 2 }}
                isAnimationActive={false}
                style={{ filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--brand) 60%, transparent))" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}

const MINUTE = 60_000;
const DAY = 86_400_000;

/**
 * X axis for a time series: explicit, de-duplicated ticks. Recharts' own ticks repeat a value when
 * the span is tiny (a seed and trades in the same block), which renders colliding React keys.
 * Short spans label with the UTC time of day, longer ones with the date.
 */
function timeAxis(points: { t: number }[]) {
  const lo = points[0]?.t ?? 0;
  const hi = Math.max(points[points.length - 1]?.t ?? 0, lo + MINUTE);
  const ticks = [...new Set(Array.from({ length: 5 }, (_, i) => Math.round((lo + ((hi - lo) * i) / 4) / MINUTE) * MINUTE))].filter(
    (t) => t >= lo && t <= hi,
  );
  const short = hi - lo < 2 * DAY;
  return {
    domain: [lo, hi] as [number, number],
    ticks,
    format: (t: number) => new Date(t).toISOString().slice(short ? 11 : 5, short ? 16 : 10),
  };
}
