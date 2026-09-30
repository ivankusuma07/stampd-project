"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageSquare, Flag } from "lucide-react";
import { Button, EmptyState } from "@stampd/ui";
import { api, ApiError } from "@/lib/api";
import type { Callout } from "@/lib/types";
import { displayName } from "@/lib/format";
import { RelativeTime } from "@/components/relative-time";
import { useSession } from "./providers";

function SideTag({ side }: { side: "YES" | "NO" }) {
  return <span className={`font-mono text-xs font-semibold ${side === "YES" ? "text-yes" : "text-no"}`}>{side}</span>;
}

function Composer({ marketId, defaultSide, parentId, onDone }: { marketId: string; defaultSide: "YES" | "NO"; parentId?: string; onDone: () => void }) {
  const [side, setSide] = useState(defaultSide);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/callouts", { method: "POST", json: { marketId, side, text, parentId } });
          setText("");
          onDone();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not post");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor={`callout-${parentId ?? marketId}`} className="sr-only">
        Your take
      </label>
      <textarea
        id={`callout-${parentId ?? marketId}`}
        required
        minLength={2}
        maxLength={280}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={parentId ? "Reply" : "Your take on this call"}
        className="w-full rounded-xl border border-rule-strong bg-surface p-2 text-sm"
        rows={parentId ? 2 : 3}
      />
      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="Your side" className="flex gap-1">
          {(["YES", "NO"] as const).map((s) => (
            <button
              type="button"
              key={s}
              role="radio"
              aria-checked={side === s}
              onClick={() => setSide(s)}
              className={`rounded-xl border px-2 py-1 font-mono text-xs ${side === s ? (s === "YES" ? "border-yes bg-yes-bg text-yes" : "border-no bg-no-bg text-no") : "border-rule text-ink-2"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs text-ink-3">{280 - text.length}</span>
        <Button type="submit" disabled={busy} className="h-8">
          Post
        </Button>
      </div>
      {error ? <p className="text-sm text-no">{error}</p> : null}
    </form>
  );
}

function CalloutItem({ c, showMarket, refresh }: { c: Callout; showMarket: boolean; refresh: () => void }) {
  const { signedIn } = useSession();
  const [replying, setReplying] = useState(false);
  const [reported, setReported] = useState(false);
  return (
    <article className="py-4">
      {showMarket ? (
        <Link href={`/markets/${c.market.id}`} className="mb-2 block font-serif text-base leading-snug text-ink-2">
          {c.market.question}
        </Link>
      ) : null}
      <p className="flex items-center gap-2 text-xs text-ink-3">
        <span className="text-ink">{displayName(c.user)}</span> <SideTag side={c.side} /> · <RelativeTime iso={c.createdAt} />
      </p>
      <p className="mt-1 text-ink">{c.text}</p>
      <div className="mt-2 flex items-center gap-4 text-xs text-ink-2">
        <button
          disabled={!signedIn}
          aria-pressed={c.liked}
          onClick={async () => {
            await api(`/callouts/${c.id}/like`, { method: "POST" });
            refresh();
          }}
          className="inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Heart size={14} strokeWidth={1.5} fill={c.liked ? "currentColor" : "none"} aria-hidden />
          <span className="font-mono">{c.likeCount}</span>
          <span className="sr-only">likes</span>
        </button>
        {signedIn ? (
          <button onClick={() => setReplying((r) => !r)} className="inline-flex items-center gap-1" aria-expanded={replying}>
            <MessageSquare size={14} strokeWidth={1.5} aria-hidden /> Reply
          </button>
        ) : null}
        {signedIn && !reported ? (
          <button
            onClick={async () => {
              await api(`/callouts/${c.id}/report`, { method: "POST", json: { reason: "reported from feed" } });
              setReported(true);
            }}
            className="inline-flex items-center gap-1"
          >
            <Flag size={14} strokeWidth={1.5} aria-hidden /> Report
          </button>
        ) : reported ? (
          <span>Reported</span>
        ) : null}
      </div>
      {c.replies.length > 0 ? (
        <ul className="mt-3 space-y-2 border-l border-rule pl-3">
          {c.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="text-xs text-ink-3">
                {displayName(r.user)} <SideTag side={r.side} /> · <RelativeTime iso={r.createdAt} />
              </span>
              <p>{r.text}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {replying ? (
        <div className="mt-3 pl-3">
          <Composer
            marketId={c.market.id}
            defaultSide={c.side}
            parentId={c.id}
            onDone={() => {
              setReplying(false);
              refresh();
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

export function CalloutFeed({ query, showMarket }: { query: string; showMarket: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["callouts", query],
    queryFn: () => api<{ callouts: Callout[] }>(`/callouts?${query}`).then((r) => r.callouts),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["callouts"] });
  if (isLoading) return <p className="text-sm text-ink-3">Loading…</p>;
  if (!data || data.length === 0) return <EmptyState title="No callouts yet">Takes always link to a market.</EmptyState>;
  return (
    <div className="divide-y divide-rule">
      {data.map((c) => (
        <CalloutItem key={c.id} c={c} showMarket={showMarket} refresh={refresh} />
      ))}
    </div>
  );
}

export function MarketCallouts({ marketId, kolSide }: { marketId: string; kolSide: "YES" | "NO" }) {
  const { signedIn } = useSession();
  const qc = useQueryClient();
  return (
    <div className="space-y-4">
      {signedIn ? (
        <Composer marketId={marketId} defaultSide={kolSide} onDone={() => void qc.invalidateQueries({ queryKey: ["callouts"] })} />
      ) : (
        <p className="text-sm text-ink-2">Sign in with your wallet to post a take.</p>
      )}
      <CalloutFeed query={`marketId=${marketId}`} showMarket={false} />
    </div>
  );
}
