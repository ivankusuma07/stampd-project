"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatedList, BellToggle } from "@stampd/ui";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { useSession } from "./providers";
import { RelativeTime } from "@/components/relative-time";

type List = { unread: number; notifications: Notification[] };

/**
 * Live notifications (development plan 6.3): an SSE stream from the API signals "something new",
 * the list is refetched; a 30s poll covers dropped streams.
 */
export function useNotifications(limit = 10) {
  const { signedIn } = useSession();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", limit],
    queryFn: () => api<List>(`/notifications?limit=${limit}`),
    enabled: signedIn,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!signedIn) return;
    const es = new EventSource("/api/notifications/stream", { withCredentials: true });
    es.addEventListener("notification", () => void qc.invalidateQueries({ queryKey: ["notifications"] }));
    return () => es.close();
  }, [signedIn, qc]);

  return query;
}

export async function markRead(body: { ids?: string[]; all?: boolean }) {
  await api("/notifications/read", { method: "POST", json: body });
}

export function NotificationBell() {
  const { signedIn } = useSession();
  const { data } = useNotifications();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!signedIn) return null;
  const items = data?.notifications ?? [];

  return (
    <div className="relative" ref={ref}>
      <BellToggle count={data?.unread ?? 0} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)} />
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-rule bg-surface">
          <div className="flex items-center justify-between border-b border-rule px-3 py-2">
            <span className="text-xs font-semibold tracking-[0.12em] uppercase">Notifications</span>
            {data?.unread ? (
              <button
                className="text-xs text-ink-2 underline"
                onClick={async () => {
                  await markRead({ all: true });
                  await qc.invalidateQueries({ queryKey: ["notifications"] });
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-2">Nothing yet. Follow a KOL or watch a market.</p>
          ) : (
            <AnimatedList
              className="max-h-96 divide-y divide-rule overflow-y-auto"
              items={items}
              getKey={(n) => n.id}
              render={(n) => (
                <Link
                  href={n.href}
                  onClick={async () => {
                    setOpen(false);
                    if (!n.readAt) {
                      await markRead({ ids: [n.id] });
                      await qc.invalidateQueries({ queryKey: ["notifications"] });
                    }
                  }}
                  className="block px-3 py-2.5 hover:bg-surface-2"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm ${n.readAt ? "text-ink-2" : "font-semibold text-ink"}`}>{n.title}</span>
                    <span className="shrink-0 font-mono text-xs text-ink-3"><RelativeTime iso={n.createdAt} /></span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block font-serif text-sm text-ink-2">{n.body}</span>
                </Link>
              )}
            />
          )}
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-rule px-3 py-2 text-center text-sm">
            All notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
