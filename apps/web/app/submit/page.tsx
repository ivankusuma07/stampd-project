"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parsePostUrl } from "@stampd/core";
import { Button, EmptyState, Input, SectionHeading, StatusMark } from "@stampd/ui";
import { api, ApiError } from "@/lib/api";
import type { Submission } from "@/lib/types";
import { RelativeTime } from "@/components/relative-time";
import { SignInGate } from "@/components/sign-in-gate";
import { PageHeader } from "@/components/page-header";

/** Submission status → StatusMark state + label, always with text (development plan 4.7). */
const STATUS: Record<Submission["status"], { mark: "pending" | "done" | "failed"; label: string }> = {
  QUEUED: { mark: "pending", label: "Queued" },
  DRAFTED: { mark: "pending", label: "Drafting" },
  IN_REVIEW: { mark: "pending", label: "In review" },
  APPROVED: { mark: "done", label: "Approved" },
  REJECTED: { mark: "failed", label: "Rejected" },
};

function SubmitForm() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<{ text: string; marketId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => api<{ submissions: Submission[] }>("/submissions").then((r) => r.submissions),
    refetchInterval: 10_000,
  });
  const parsed = url ? parsePostUrl(url) : null;

  return (
    <div className="space-y-10">
      <form
        className="max-w-2xl space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/submissions", { method: "POST", json: { url } });
            setUrl("");
            await qc.invalidateQueries({ queryKey: ["submissions"] });
          } catch (err) {
            if (err instanceof ApiError) setError({ text: err.message, marketId: err.body.marketId as string | undefined });
            else setError({ text: "Could not submit" });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="post-url" className="text-sm font-medium">
          Link to a post on X
        </label>
        <div className="flex gap-2">
          <Input
            id="post-url"
            type="url"
            required
            placeholder="https://x.com/handle/status/1873…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={url !== "" && !parsed}
            aria-describedby="post-url-help"
          />
          <Button type="submit" disabled={busy || !parsed}>
            {busy ? "Sending…" : "Submit"}
          </Button>
        </div>
        <p id="post-url-help" className="text-xs text-ink-3">
          {url && !parsed
            ? "That isn't an x.com or twitter.com post link."
            : "A dated, checkable call works best, e.g. “BTC closes above $90k before end of March”. Up to 5 a day."}
        </p>
        {error ? (
          <p className="text-sm text-no">
            {error.text}
            {error.marketId ? (
              <>
                {" "}
                <Link href={`/markets/${error.marketId}`} className="underline">See the market</Link>.
              </>
            ) : null}
          </p>
        ) : null}
      </form>

      <section>
        <SectionHeading>Your submissions</SectionHeading>
        {isLoading ? (
          <p className="text-sm text-ink-3">Loading…</p>
        ) : !data || data.length === 0 ? (
          <EmptyState title="Nothing submitted yet">If your link becomes a market, you&apos;re credited on it and earn points.</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start gap-3 py-3">
                <StatusMark status={STATUS[s.status].mark} label={STATUS[s.status].label} size={18} />
                <div className="min-w-0 flex-1">
                  {s.market ? (
                    <Link href={`/markets/${s.market.id}`} className="font-serif text-lg">
                      {s.market.question}
                    </Link>
                  ) : (
                    <p className="font-serif text-lg text-ink-2">{s.question ?? "Waiting for the draft"}</p>
                  )}
                  <a href={s.xPostUrl} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-ink-3 underline">
                    {s.xPostUrl}
                  </a>
                  {s.reason ? <p className="mt-1 text-sm text-no">{s.reason}</p> : null}
                  {s.status === "QUEUED" ? (
                    <p className="mt-1 text-xs text-ink-3">Queued. It&apos;s picked up automatically if the X feed is down.</p>
                  ) : null}
                </div>
                <span className="font-mono text-xs text-ink-3"><RelativeTime iso={s.createdAt} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Put it on the record" title={<>Submit a <span className="text-gradient">call</span></>} tone="violet">
        Paste a post where someone makes a checkable prediction. An AI drafts the market and a moderator reviews it before it
        goes live.
      </PageHeader>
      <SignInGate why="Submissions are credited to your wallet.">
        <SubmitForm />
      </SignInGate>
    </div>
  );
}
