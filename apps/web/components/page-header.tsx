import type { ReactNode } from "react";

/** Glass title card shared by the secondary pages: eyebrow, display title, blurb and optional controls. */
export function PageHeader({
  eyebrow,
  title,
  children,
  aside,
  tone = "brand",
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  tone?: "brand" | "violet" | "cyan";
}) {
  const glow = tone === "violet" ? "bg-brand-2/20" : tone === "cyan" ? "bg-brand-3/15" : "bg-brand/15";
  return (
    <header className="relative overflow-hidden rounded-3xl border border-rule bg-surface/80 p-6 backdrop-blur md:p-8">
      <div aria-hidden className={`pointer-events-none absolute -top-32 -right-10 h-72 w-72 rounded-full blur-3xl ${glow}`} />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink md:text-5xl">{title}</h1>
          {children ? <div className="mt-3 max-w-2xl text-ink-2">{children}</div> : null}
        </div>
        {aside}
      </div>
    </header>
  );
}
