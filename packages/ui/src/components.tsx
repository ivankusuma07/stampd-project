import type { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { formatCents, formatCentsDelta, formatEdge } from "@stampd/core";

/**
 * STAMPD UI primitives (development plan 1.6). Hierarchy comes from type, weight and 1px rules,
 * not colour or shadows. YES/NO always carry the word, never colour alone (plan 1.3).
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ prices

export type Side = "YES" | "NO";

/** "YES 56¢" chip. */
export function PriceChip({ side, bps, className }: { side: Side; bps: number; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-baseline gap-1 rounded-[4px] px-1.5 py-0.5 font-mono text-sm tabular-nums",
        side === "YES" ? "bg-yes-bg text-yes" : "bg-no-bg text-no",
        className,
      )}
    >
      <span className="text-xs font-semibold tracking-wide">{side}</span>
      {formatCents(bps)}
    </span>
  );
}

/** 24h change in cents. The sign carries the meaning; colour only reinforces it. */
export function Change({ bps, className }: { bps: number | null; className?: string }) {
  if (bps === null) return <span className={cx("font-mono text-sm text-ink-3", className)}>—</span>;
  const cls = bps > 0 ? "text-yes" : bps < 0 ? "text-no" : "text-ink-3";
  return <span className={cx("font-mono text-sm tabular-nums", cls, className)}>{formatCentsDelta(bps)}</span>;
}

// ------------------------------------------------------------------ track record

/** "+0.12 edge · 18 calls" with the formula in one sentence (plan 1.6 #5). */
export function EdgeBadge({ avgEdge, n, className }: { avgEdge: number | null; n: number; className?: string }) {
  const explain =
    "Edge = 1 if the call was right, 0 if wrong, minus the crowd's price of that side over the first 24h. Positive means the KOL beat the crowd.";
  return (
    <span className={cx("font-mono text-sm tabular-nums text-ink-2", className)} title={explain}>
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

/** Typographic stamp on a highlighter, rotated −2° (no emoji, plan 1.2). */
export function Stamp({ kind }: { kind: StampKind }) {
  return (
    <span className="mark inline-block -rotate-2 border border-mark-ink px-1.5 py-0.5 font-mono text-xs font-semibold tracking-widest">
      [{kind}]
    </span>
  );
}

/** Till-receipt block: dashed rules and mono label/value lines (plan 1.6 #4). */
export function ReceiptBlock({ lines, stamp, className }: { lines: ReceiptLine[]; stamp?: StampKind; className?: string }) {
  return (
    <div className={cx("receipt-rule border-b border-dashed border-b-rule-strong py-3 font-mono text-sm", className)}>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1">
        {lines.map((l) => (
          <div key={l.label} className="contents">
            <dt className="text-ink-3 uppercase">{l.label}</dt>
            <dd className="min-w-0 break-words text-ink">{l.value}</dd>
          </div>
        ))}
      </dl>
      {stamp ? (
        <div className="mt-2 text-right">
          <Stamp kind={stamp} />
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ people

/** KOL avatar: the real X avatar or initials. Never a generated face (plan 1.2). */
export function Avatar({ src, handle, size = 24 }: { src?: string | null; handle: string; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full border border-rule" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full border border-rule bg-surface font-mono text-[10px] text-ink-2 uppercase"
      style={{ width: size, height: size }}
    >
      {handle.slice(0, 2)}
    </span>
  );
}

// ------------------------------------------------------------------ controls

type ButtonVariant = "primary" | "secondary" | "ghost" | "yes" | "no";
const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:opacity-90",
  secondary: "border border-rule-strong bg-surface text-ink hover:bg-paper",
  ghost: "text-ink hover:bg-rule/40",
  yes: "bg-yes text-surface hover:opacity-90",
  no: "bg-no text-surface hover:opacity-90",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[4px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  return (
    <a
      className={cx("inline-flex h-10 items-center justify-center gap-2 rounded-[4px] px-4 text-sm font-medium", BUTTON[variant], className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-[4px] border border-rule-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3",
        className,
      )}
      {...props}
    />
  );
}

/** Segmented tabs rendered as links or buttons by the caller. */
export function Tabs({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-rule">
      {children}
    </div>
  );
}

export function tabClass(active: boolean) {
  return cx(
    "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap",
    active ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink",
  );
}

// ------------------------------------------------------------------ layout

export function SectionHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-ink pb-1.5">
      <h2 className="text-xs font-semibold tracking-[0.12em] text-ink uppercase">{children}</h2>
      {aside ? <div className="text-sm text-ink-2">{aside}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-[6px] border border-rule bg-surface", className)}>{children}</div>;
}

/** A clearly labelled empty state — never placeholder numbers (plan 1.2). */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-dashed border-rule-strong px-4 py-8 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      {children ? <div className="mt-1 text-sm text-ink-2">{children}</div> : null}
    </div>
  );
}
