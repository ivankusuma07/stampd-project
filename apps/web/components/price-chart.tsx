"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateTimeUtc } from "@stampd/core";
import { api } from "@/lib/api";
import { tabClass } from "@stampd/ui";

type Point = { t: string; yesPriceBps: number };
const RANGES = ["1d", "1w", "1m", "all"] as const;

/**
 * YES price over time (development plan 1.5 "Charts"): a 1.5px --ink line, no fill, no gradient,
 * mono crosshair tooltip.
 */
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

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between">
        <figcaption className="text-xs tracking-[0.08em] text-ink-3 uppercase">YES price</figcaption>
        <div role="tablist" aria-label="Chart range" className="flex">
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)} className={tabClass(range === r)}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height }} className="w-full">
        {points.length < 2 ? (
          <div className="grid h-full place-items-center rounded-[6px] border border-dashed border-rule-strong text-sm text-ink-2">
            {isLoading ? "Loading…" : "Not enough trades to chart yet."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 24, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--rule)" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t: number) => new Date(t).toISOString().slice(5, 10)}
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
                cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
                labelFormatter={(t) => formatDateTimeUtc(Number(t))}
                formatter={(v) => [`${Number(v).toFixed(1)}¢`, "YES"]}
              />
              <Line type="stepAfter" dataKey="cents" stroke="var(--ink)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}
