"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState } from "@stampd/ui";
import { formatDateTimeUtc } from "@stampd/core";
import { SignInGate } from "@/components/sign-in-gate";
import { markRead, useNotifications } from "@/components/notifications";

function List() {
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications(100);
  if (isLoading) return <p className="text-sm text-ink-3">Loading…</p>;
  const items = data?.notifications ?? [];
  if (items.length === 0) {
    return <EmptyState title="No notifications yet">You&apos;re told about new markets from KOLs you follow, results on markets you watch or hold, and your submissions.</EmptyState>;
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  return (
    <div className="space-y-3">
      {data?.unread ? (
        <Button variant="secondary" onClick={async () => (await markRead({ all: true }), refresh())}>
          Mark all as read
        </Button>
      ) : null}
      <ul className="divide-y divide-rule border-y border-rule">
        {items.map((n) => (
          <li key={n.id}>
            <Link
              href={n.href}
              onClick={() => (n.readAt ? undefined : markRead({ ids: [n.id] }).then(refresh))}
              className="flex gap-3 py-3 hover:bg-surface"
            >
              <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-ink"}`} />
              <span className="min-w-0 flex-1">
                <span className={`block ${n.readAt ? "text-ink-2" : "font-semibold"}`}>
                  {n.title}
                  {n.readAt ? null : <span className="sr-only"> (unread)</span>}
                </span>
                <span className="block font-serif text-ink-2">{n.body}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-3">{formatDateTimeUtc(n.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold">Notifications</h1>
      <SignInGate why="Notifications belong to your wallet.">
        <List />
      </SignInGate>
    </div>
  );
}
