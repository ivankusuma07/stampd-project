import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { formatCents, formatCentsDelta, formatEdge } from "@stampd/core";
import { Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

/**
 * STAMPD UI primitives ("Neon Receipt", docs/decisions.md D14). YES/NO always carry the word,
 * never colour alone.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ prices

export type Side = "YES" | "NO";

/** "YES 56¢" pill. */
export function PriceChip({ side, bps, className }: { side: Side; bps: number; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-sm tabular-nums",
        side === "YES" ? "border-yes/30 bg-yes-bg text-yes" : "border-no/30 bg-no-bg text-no",
        className,
      )}
    >
      <span className="text-[10px] font-bold tracking-widest">{side}</span>
      {formatCents(bps)}
    </span>
  );
}

/** 24h change: arrow + cents. The sign carries the meaning; colour reinforces it. */
export function Change({ bps, className }: { bps: number | null; className?: string }) {
  if (bps === null) return <span className={cx("font-mono text-sm text-ink-3", className)}>—</span>;
  const cls = bps > 0 ? "text-yes" : bps < 0 ? "text-no" : "text-ink-3";
  return (
    <span className={cx("inline-flex items-center gap-0.5 font-mono text-sm tabular-nums", cls, className)}>
      {bps > 0 ? (
        <TrendingUp size="1em" strokeWidth={2.25} aria-hidden />
      ) : bps < 0 ? (
        <TrendingDown size="1em" strokeWidth={2.25} aria-hidden />
      ) : (
        <Minus size="1em" strokeWidth={2.25} aria-hidden />
      )}
      {formatCentsDelta(bps)}
    </span>
  );
}

/** YES/NO split bar: the crowd's odds at a glance. */
export function ProbabilityBar({ yesBps, className, thick }: { yesBps: number; className?: string; thick?: boolean }) {
  const yes = Math.max(0, Math.min(100, yesBps / 100));
  return (
    <div
      className={cx("flex w-full overflow-hidden rounded-full bg-no/25", thick ? "h-2.5" : "h-1.5", className)}
      role="img"
      aria-label={`YES ${Math.round(yes)}%, NO ${Math.round(100 - yes)}%`}
    >
      <div className="h-full rounded-full bg-yes shadow-[0_0_12px_var(--yes)] transition-[width] duration-700" style={{ width: `${yes}%` }} />
    </div>
  );
}

/** Circular YES-probability gauge. */
export function ProbabilityRing({ yesBps, size = 132 }: { yesBps: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, yesBps / 100));
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--no)" strokeOpacity="0.25" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--yes)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          style={{ filter: "drop-shadow(0 0 6px var(--yes))", transition: "stroke-dasharray 700ms ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-3xl font-bold text-ink tabular-nums">{Math.round(pct)}%</div>
        <div className="text-[10px] font-bold tracking-[0.2em] text-yes">YES</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ track record

/** "+0.12 edge · 18 calls" with the formula in one sentence. */
export function EdgeBadge({ avgEdge, n, className }: { avgEdge: number | null; n: number; className?: string }) {
  const explain =
    "Edge = 1 if the call was right, 0 if wrong, minus the crowd's price of that side over the first 24h. Positive means the KOL beat the crowd.";
  const tone = avgEdge === null || n === 0 ? "text-ink-3" : avgEdge > 0 ? "text-yes" : avgEdge < 0 ? "text-no" : "text-ink-2";
  return (
    <span className={cx("font-mono text-sm tabular-nums", tone, className)} title={explain}>
      {formatEdge(avgEdge, n)}
      <span className="sr-only">. {explain}</span>
    </span>
  );
}

/** "75% hit · 4 calls" — a rate is never shown without its sample size. */
export function HitRate({ rate, n, className }: { rate: number | null; n: number; className?: string }) {
  return (
    <span className={cx("font-mono text-sm tabular-nums text-ink-2", className)}>
      {rate === null || n === 0 ? "no resolved calls" : `${Math.round(rate * 100)}% hit · ${n} call${n === 1 ? "" : "s"}`}
    </span>
  );
}

// ------------------------------------------------------------------ receipt

export type ReceiptLine = { label: string; value: ReactNode };
export type StampKind = "CALLED IT" | "MISSED" | "VOID";

/** The stamp: a rotated neon label (no emoji). */
export function Stamp({ kind }: { kind: StampKind }) {
  const tone =
    kind === "CALLED IT"
      ? "bg-brand text-brand-ink shadow-[0_0_24px_-4px_var(--brand)]"
      : kind === "MISSED"
        ? "bg-no text-white shadow-[0_0_24px_-4px_var(--no)]"
        : "bg-ink-3 text-paper";
  return (
    <span className={cx("inline-block -rotate-3 rounded-md px-2 py-1 font-display text-[11px] font-bold tracking-[0.18em]", tone)}>
      {kind}
    </span>
  );
}

/** Till-receipt block: dashed rules and mono label/value lines. */
export function ReceiptBlock({ lines, stamp, className }: { lines: ReceiptLine[]; stamp?: StampKind; className?: string }) {
  return (
    <div className={cx("receipt-rule border-b border-dashed border-b-rule-strong py-3 font-mono text-sm", className)}>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5">
        {lines.map((l) => (
          <div key={l.label} className="contents">
            <dt className="text-[11px] tracking-widest text-ink-3 uppercase">{l.label}</dt>
            <dd className="min-w-0 wrap-break-word text-ink">{l.value}</dd>
          </div>
        ))}
      </dl>
      {stamp ? (
        <div className="mt-3 text-right">
          <Stamp kind={stamp} />
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ people

/** KOL avatar: the real X avatar or initials on a brand gradient. Never a generated face. */
export function Avatar({ src, handle, size = 24 }: { src?: string | null; handle: string; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full ring-1 ring-rule-strong" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,var(--brand),var(--brand-3),var(--brand-2),var(--brand))] font-display font-bold text-brand-ink uppercase"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
    >
      {handle.slice(0, 2)}
    </span>
  );
}

/** Pulsing dot for live things (block number, live markets). */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-yes", className)} />;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-rule-strong bg-surface-2/70 px-2.5 py-1 text-xs text-ink-2", className)}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ controls

type ButtonVariant = "primary" | "secondary" | "ghost" | "yes" | "no";
const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-110 shadow-[0_8px_30px_-8px_var(--brand)]",
  secondary: "border border-rule-strong bg-surface-2/60 text-ink backdrop-blur hover:border-ink-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
  yes: "bg-yes text-[#04130c] hover:brightness-110 shadow-[0_8px_30px_-10px_var(--yes)]",
  no: "bg-no text-white hover:brightness-110 shadow-[0_8px_30px_-10px_var(--no)]",
};
const BTN_BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" className={cx(BTN_BASE, BUTTON[variant], className)} {...props} />;
}

export function LinkButton({ variant = "secondary", className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  return <a className={cx(BTN_BASE, BUTTON[variant], className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-11 w-full rounded-xl border border-rule-strong bg-surface-2 px-4 text-sm text-ink placeholder:text-ink-3 focus:border-brand/60",
        className,
      )}
      {...props}
    />
  );
}

/** Pill tabs; the caller renders links or buttons with `tabClass`. */
export function Tabs({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1">
      {children}
    </div>
  );
}

export function tabClass(active: boolean) {
  return cx(
    "shrink-0 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition",
    active ? "border-brand/50 bg-brand/10 font-semibold text-accent" : "border-rule bg-surface/60 text-ink-2 hover:border-rule-strong hover:text-ink",
  );
}

// ------------------------------------------------------------------ layout

export function SectionHeading({ children, aside, eyebrow }: { children: ReactNode; aside?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-accent uppercase">{eyebrow}</p> : null}
        <h2 className="font-display text-xl font-bold tracking-tight text-ink md:text-2xl">{children}</h2>
      </div>
      {aside ? <div className="text-sm text-ink-2 [&_a:hover]:text-accent">{aside}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-rule bg-surface/80 backdrop-blur", className)}>{children}</div>;
}

/** A clearly labelled empty state — never placeholder numbers. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-rule-strong bg-surface/40 px-6 py-10 text-center">
      <div aria-hidden className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full border border-rule-strong text-accent">
        <Sparkles size={18} strokeWidth={1.75} />
      </div>
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-ink-2">{children}</div> : null}
    </div>
  );
}
