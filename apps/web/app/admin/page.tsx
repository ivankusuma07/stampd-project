"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { marketHubAbi, resolverAbi } from "@stampd/chain";
import { formatCents, formatDateTimeUtc, RESULT_TO_CHAIN } from "@stampd/core";
import { Button, EmptyState, Input, SectionHeading, StatusMark, Tabs, tabClass } from "@stampd/ui";
import { api, ApiError } from "@/lib/api";
import { deployment } from "@/lib/chain";
import type { Market } from "@/lib/types";
import { shortAddress, timeAgo } from "@/lib/format";
import { useSession } from "@/components/providers";
import { SignInGate } from "@/components/sign-in-gate";
import { useToasts } from "@/components/toasts";

const TABS = ["queue", "resolutions", "markets", "kols", "takedowns", "health", "alerts", "templates", "audit"] as const;
type Tab = (typeof TABS)[number];

type QueueItem = {
  id: string;
  status: string;
  source: "TIMELINE" | "WEB";
  submittedBy: string | null;
  route: string | null;
  aiDecision: string | null;
  template: string | null;
  extracted: Record<string, unknown> | null;
  check: Record<string, unknown> | null;
  validatorErrors: { code: string; message: string }[];
  reviewReason: string | null;
  createError: string | null;
  createdAt: string;
  post: { xPostId: string; text: string; url: string; authorHandle: string; postedAt: string; kolExcluded: boolean };
};

function useAdmin<T>(path: string, key: string) {
  return useQuery({ queryKey: ["admin", key], queryFn: () => api<T>(`/admin${path}`), refetchInterval: 20_000 });
}

function useChainTx() {
  const config = useConfig();
  const toasts = useToasts();
  const { writeContractAsync } = useWriteContract();
  return async (label: string, req: Parameters<typeof writeContractAsync>[0]) => {
    const id = toasts.push({ title: `${label}…`, tone: "info" });
    try {
      const hash = await writeContractAsync(req);
      await waitForTransactionReceipt(config, { hash });
      toasts.update(id, { title: `${label} confirmed`, tone: "ok", hash });
      return true;
    } catch (err) {
      toasts.update(id, { title: `${label} failed`, description: (err as { shortMessage?: string }).shortMessage ?? "", tone: "error" });
      return false;
    }
  };
}

// ------------------------------------------------------------------ review queue

const EDITABLE = ["question", "rules", "deadline_utc", "subject", "metric", "comparator", "threshold", "resolution_source", "category", "kol_side"] as const;

function Draft({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const x = (item.extracted ?? {}) as Record<string, string | number | boolean>;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [price, setPrice] = useState("50");
  const [seed, setSeed] = useState("200");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const approve = async () => {
    setMsg(null);
    const changed = Object.fromEntries(Object.entries(edits).filter(([k, v]) => String(x[k] ?? "") !== v));
    try {
      const r = await api<{ softWarnings: string[] }>(`/admin/predictions/${item.id}/approve`, {
        method: "POST",
        json: { edits: changed, openingPriceBps: Math.round(Number(price) * 100), seedUsd: Number(seed) },
      });
      setMsg(r.softWarnings.length ? `Approved with warnings: ${r.softWarnings.join(", ")}` : "Approved — creating onchain");
      onDone();
    } catch (err) {
      setMsg(err instanceof ApiError ? `${err.message}${err.body.messages ? `: ${(err.body.messages as string[]).join("; ")}` : ""}` : "failed");
    }
  };
  const reject = async () => {
    await api(`/admin/predictions/${item.id}/reject`, { method: "POST", json: { reason } });
    onDone();
  };

  return (
    <article className="rounded-2xl border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span>@{item.post.authorHandle}</span>·<span>{item.source === "WEB" ? `submitted by ${shortAddress(item.submittedBy ?? "")}` : "timeline"}</span>·
        <span>{timeAgo(item.createdAt)} ago</span>·<span>AI would: {item.aiDecision ?? "—"}</span>
        {item.template ? <span>· template {item.template}</span> : null}
        {item.post.kolExcluded ? <span className="text-no">· KOL EXCLUDED</span> : null}
      </div>
      <blockquote className="mt-2 border-l-2 border-brand pl-3 font-serif text-lg">{item.post.text}</blockquote>
      <a href={item.post.url} target="_blank" rel="noreferrer" className="text-xs underline">
        Post on X
      </a>

      {item.validatorErrors.length ? (
        <ul className="mt-3 text-sm text-no">
          {item.validatorErrors.map((e) => (
            <li key={e.code}>
              {e.code}: {e.message}
            </li>
          ))}
        </ul>
      ) : null}
      {item.createError ? <p className="mt-2 text-sm text-no">Onchain create failed: {item.createError}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {EDITABLE.map((k) => (
          <label key={k} className={`space-y-1 text-xs text-ink-3 ${k === "question" || k === "rules" ? "md:col-span-2" : ""}`}>
            {k}
            {k === "rules" ? (
              <textarea
                rows={3}
                defaultValue={String(x[k] ?? "")}
                onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                className="w-full rounded-xl border border-rule-strong bg-surface p-2 text-sm text-ink"
              />
            ) : (
              <Input defaultValue={String(x[k] ?? "")} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-2">AI outputs (extract · check)</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <pre className="overflow-auto rounded-xl bg-paper p-2 font-mono text-xs">{JSON.stringify(item.extracted, null, 2)}</pre>
          <pre className="overflow-auto rounded-xl bg-paper p-2 font-mono text-xs">{JSON.stringify(item.check, null, 2)}</pre>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-rule pt-4">
        <label className="text-xs text-ink-3">
          Opening YES ¢
          <Input className="w-20" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" />
        </label>
        <label className="text-xs text-ink-3">
          Seed dUSD
          <Input className="w-24" value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="numeric" />
        </label>
        <Button variant="yes" onClick={approve}>
          Approve &amp; create
        </Button>
        <Input className="max-w-xs" placeholder="Reason to reject" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="no" disabled={reason.trim().length < 3} onClick={reject}>
          Reject
        </Button>
      </div>
      {msg ? <p className="mt-2 text-sm">{msg}</p> : null}
    </article>
  );
}

function Queue() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("IN_REVIEW");
  const { data } = useQuery({
    queryKey: ["admin", "queue", status],
    queryFn: () => api<{ items: QueueItem[] }>(`/admin/queue?status=${status}`),
    refetchInterval: 20_000,
  });
  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-sm">
        {["IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={status === s ? "font-semibold" : "text-ink-2"}>
            {s.replace("_", " ").toLowerCase()}
          </button>
        ))}
      </div>
      {!data?.items.length ? (
        <EmptyState title="Nothing here" />
      ) : status === "IN_REVIEW" ? (
        data.items.map((i) => <Draft key={i.id} item={i} onDone={() => void qc.invalidateQueries({ queryKey: ["admin"] })} />)
      ) : (
        <ul className="divide-y divide-rule">
          {data.items.map((i) => (
            <li key={i.id} className="py-2 text-sm">
              <span className="font-serif">{String(i.extracted?.question ?? i.post.text).slice(0, 140)}</span>
              {i.reviewReason ? <span className="text-ink-3"> — {i.reviewReason}</span> : null}
              {i.createError ? <span className="text-no"> — {i.createError}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ resolutions + markets

function Resolutions() {
  const qc = useQueryClient();
  const tx = useChainTx();
  const { data } = useAdmin<{ markets: Market[] }>("/resolutions", "resolutions");
  const [note, setNote] = useState("");
  if (!data?.markets.length) return <EmptyState title="Nothing awaiting resolution" />;
  return (
    <ul className="space-y-4">
      {data.markets.map((m) => (
        <li key={m.id} className="rounded-2xl border border-rule bg-surface p-4">
          <Link href={`/markets/${m.id}`} className="font-serif text-lg">
            {m.question}
          </Link>
          <p className="font-mono text-xs text-ink-3">
            {m.status} · closed {formatDateTimeUtc(m.closeTime)} · resolve by {formatDateTimeUtc(m.resolveBy)}
          </p>
          {m.resolution ? (
            <p className="mt-2 text-sm">
              Proposed {m.resolution.proposedOutcome} · window ends {formatDateTimeUtc(m.resolution.disputeEnds)}
              {m.resolution.disputed ? <strong className="text-no"> · DISPUTED by {shortAddress(m.resolution.disputer ?? "")}</strong> : null}
            </p>
          ) : null}
          {m.resolution?.disputed && !m.resolution.finalizedAt ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="self-center text-sm text-ink-2">Arbitrate from the arbiter wallet:</span>
              {(["YES", "NO", "INVALID"] as const).map((o) => (
                <Button
                  key={o}
                  variant="secondary"
                  onClick={async () => {
                    if (await tx(`Arbitrate ${o}`, { address: deployment!.contracts.Resolver, abi: resolverAbi, functionName: "arbitrate", args: [BigInt(m.onchainId!), RESULT_TO_CHAIN[o]] }))
                      await qc.invalidateQueries();
                  }}
                >
                  {o}
                </Button>
              ))}
            </div>
          ) : null}
          {!m.resolution ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input className="max-w-sm" placeholder="Why a manual proposal (≥10 chars)" value={note} onChange={(e) => setNote(e.target.value)} />
              {(["YES", "NO", "INVALID"] as const).map((o) => (
                <Button
                  key={o}
                  variant="secondary"
                  disabled={note.trim().length < 10}
                  onClick={async () => {
                    await api(`/admin/markets/${m.id}/propose`, { method: "POST", json: { outcome: o, note } });
                    setNote("");
                  }}
                >
                  Propose {o}
                </Button>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Markets() {
  const tx = useChainTx();
  const qc = useQueryClient();
  const { data } = useAdmin<{ markets: (Market & { flags: number })[] }>("/markets", "markets");
  if (!data?.markets.length) return <EmptyState title="No markets" />;
  return (
    <table className="w-full text-sm">
      <tbody>
        {data.markets.map((m) => (
          <tr key={m.id} className="border-b border-rule">
            <td className="py-2 pr-3">
              <Link href={`/markets/${m.id}`} className="font-serif">
                {m.question}
              </Link>
              <span className="block font-mono text-xs text-ink-3">
                {m.status} · YES {formatCents(m.yesPriceBps)} · {m.flags} flag{m.flags === 1 ? "" : "s"}
                {m.paused ? " · PAUSED" : ""}
              </span>
            </td>
            <td className="py-2 text-right">
              {m.onchainId && m.status === "OPEN" ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (await tx(m.paused ? "Unpause" : "Pause", { address: deployment!.contracts.MarketHub, abi: marketHubAbi, functionName: "setMarketPaused", args: [BigInt(m.onchainId!), !m.paused] }))
                      await qc.invalidateQueries({ queryKey: ["admin", "markets"] });
                  }}
                >
                  {m.paused ? "Unpause" : "Pause"}
                </Button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ kols, takedowns

function Kols() {
  const qc = useQueryClient();
  const { data } = useAdmin<{ kols: { id: string; handle: string; name: string; excluded: boolean; pollIntervalMin: number; lastFetchedAt: string | null; live: number }[] }>("/kols", "kols");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "kols"] });
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/admin/kols", { method: "POST", json: { handle, name } });
          setHandle("");
          setName("");
          await refresh();
        }}
      >
        <Input className="max-w-40" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} required />
        <Input className="max-w-60" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit">Track KOL</Button>
      </form>
      <table className="w-full text-sm">
        <tbody>
          {data?.kols.map((k) => (
            <tr key={k.id} className="border-b border-rule">
              <td className="py-2">@{k.handle}</td>
              <td className="py-2 font-mono text-xs text-ink-3">every {k.pollIntervalMin}m · last {k.lastFetchedAt ? timeAgo(k.lastFetchedAt) : "never"}</td>
              <td className="py-2 font-mono">{k.live} live</td>
              <td className="py-2 text-right">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await api(`/admin/kols/${k.id}`, { method: "PATCH", json: { excluded: !k.excluded } });
                    await refresh();
                  }}
                >
                  {k.excluded ? "Re-include" : "Exclude"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Takedowns() {
  const qc = useQueryClient();
  const { data } = useAdmin<{ takedowns: { id: string; kolHandle: string; name: string; contact: string; urls: string; reason: string; status: string; createdAt: string }[] }>("/takedowns", "takedowns");
  if (!data?.takedowns.length) return <EmptyState title="No takedown requests" />;
  return (
    <ul className="space-y-3">
      {data.takedowns.map((t) => (
        <li key={t.id} className="rounded-2xl border border-rule bg-surface p-4 text-sm">
          <p>
            <strong>@{t.kolHandle}</strong> · {t.name} · {t.contact} · {t.status}
          </p>
          <p className="mt-1 text-ink-2">{t.reason}</p>
          {t.urls ? <p className="mt-1 font-mono text-xs break-all text-ink-3">{t.urls}</p> : null}
          {t.status === "OPEN" ? (
            <div className="mt-2 flex gap-2">
              {(["exclude", "reject"] as const).map((a) => (
                <Button
                  key={a}
                  variant={a === "exclude" ? "primary" : "secondary"}
                  onClick={async () => {
                    await api(`/admin/takedowns/${t.id}`, { method: "POST", json: { action: a } });
                    await qc.invalidateQueries({ queryKey: ["admin", "takedowns"] });
                  }}
                >
                  {a === "exclude" ? "Exclude KOL" : "Decline"}
                </Button>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ ops

function Health() {
  const { data } = useAdmin<{
    scraper: Record<string, unknown> | null;
    ingest: { paused: boolean; reason: string | null; lastSuccessAt: string | null };
    indexer: { block: string | null };
    runs: { id: string; jobType: string; kol: string | null; status: string; postsReturned: number; error: string | null; startedAt: string }[];
  }>("/health", "health");
  if (!data) return null;
  return (
    <div className="space-y-6">
      <dl className="grid gap-4 font-mono text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-3 uppercase">Ingest</dt>
          <dd>
            <StatusMark status={data.ingest.paused ? "failed" : "done"} label={data.ingest.paused ? `Paused: ${data.ingest.reason}` : "Running"} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3 uppercase">Last successful fetch</dt>
          <dd>{data.ingest.lastSuccessAt ? formatDateTimeUtc(data.ingest.lastSuccessAt) : "never"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3 uppercase">Indexed block</dt>
          <dd>{data.indexer.block ?? "—"}</dd>
        </div>
      </dl>
      <pre className="overflow-auto rounded-xl bg-surface p-3 font-mono text-xs">{JSON.stringify(data.scraper, null, 2)}</pre>
      <SectionHeading>Recent ingest runs</SectionHeading>
      <table className="w-full font-mono text-xs">
        <tbody>
          {data.runs.map((r) => (
            <tr key={r.id} className="border-b border-rule">
              <td className="py-1">{timeAgo(r.startedAt)}</td>
              <td>{r.jobType}</td>
              <td>{r.kol ? `@${r.kol}` : ""}</td>
              <td className={r.status === "FAILED" ? "text-no" : ""}>{r.status}</td>
              <td>{r.postsReturned} posts</td>
              <td className="text-no">{r.error?.slice(0, 80)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Alerts() {
  const qc = useQueryClient();
  const { data } = useAdmin<{ alerts: { id: string; kind: string; message: string; createdAt: string; resolvedAt: string | null }[] }>("/alerts", "alerts");
  if (!data?.alerts.length) return <EmptyState title="No alerts" />;
  return (
    <ul className="divide-y divide-rule">
      {data.alerts.map((a) => (
        <li key={a.id} className={`flex items-start gap-3 py-2 text-sm ${a.resolvedAt ? "text-ink-3" : ""}`}>
          <span className="w-40 shrink-0 font-mono text-xs">{a.kind}</span>
          <span className="flex-1">{a.message}</span>
          <span className="font-mono text-xs">{timeAgo(a.createdAt)}</span>
          {!a.resolvedAt ? (
            <button
              className="text-xs underline"
              onClick={async () => {
                await api(`/admin/alerts/${a.id}/resolve`, { method: "POST" });
                await qc.invalidateQueries({ queryKey: ["admin", "alerts"] });
              }}
            >
              Resolve
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Plan B10a rollout: switch a template on only at ≥95% agreement on ≥100 cases. */
function Templates() {
  const qc = useQueryClient();
  const { data } = useAdmin<{ templates: Record<string, { n: number; agree: number; rate: number | null }>; enabled: string[] }>("/agreement", "agreement");
  if (!data) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-rule-strong text-left text-xs text-ink-3 uppercase">
          <th className="py-2 font-medium">Template</th>
          <th className="py-2 text-right font-medium">Agreement</th>
          <th className="py-2 text-right font-medium">Auto-publish</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(data.templates).map(([id, t]) => {
          const on = data.enabled.includes(id);
          const ready = t.n >= 100 && (t.rate ?? 0) >= 0.95;
          return (
            <tr key={id} className="border-b border-rule">
              <td className="py-2 font-mono">{id}</td>
              <td className="py-2 text-right font-mono">
                {t.rate === null ? "—" : `${Math.round(t.rate * 100)}%`} · {t.n} cases {ready ? "" : <span className="text-ink-3">(needs ≥95% on ≥100)</span>}
              </td>
              <td className="py-2 text-right">
                <Button
                  variant={on ? "no" : "secondary"}
                  disabled={!on && !ready}
                  onClick={async () => {
                    const enabled = on ? data.enabled.filter((x) => x !== id) : [...data.enabled, id];
                    await api("/admin/config/templates", { method: "PUT", json: { enabled } });
                    await qc.invalidateQueries({ queryKey: ["admin", "agreement"] });
                  }}
                >
                  {on ? "Turn off" : "Turn on"}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Audit() {
  const { data } = useAdmin<{ entries: { id: string; adminWallet: string; action: string; target: string | null; createdAt: string }[] }>("/audit", "audit");
  if (!data?.entries.length) return <EmptyState title="No admin actions yet" />;
  return (
    <table className="w-full font-mono text-xs">
      <tbody>
        {data.entries.map((e) => (
          <tr key={e.id} className="border-b border-rule">
            <td className="py-1">{formatDateTimeUtc(e.createdAt)}</td>
            <td>{shortAddress(e.adminWallet)}</td>
            <td>{e.action}</td>
            <td className="text-ink-3">{e.target}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Console() {
  const { isAdmin } = useSession();
  const [tab, setTab] = useState<Tab>("queue");
  if (!isAdmin) return <EmptyState title="Admins only">This wallet isn&apos;t on the admin allowlist.</EmptyState>;
  const View = { queue: Queue, resolutions: Resolutions, markets: Markets, kols: Kols, takedowns: Takedowns, health: Health, alerts: Alerts, templates: Templates, audit: Audit }[tab];
  return (
    <div className="space-y-6">
      <Tabs label="Admin sections">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`${tabClass(tab === t)} capitalize`}>
            {t}
          </button>
        ))}
      </Tabs>
      <View />
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Admin</h1>
      <SignInGate why="The admin console is restricted to allowlisted wallets.">
        <Console />
      </SignInGate>
    </div>
  );
}
