import Link from "next/link";

/** Wordmark: a tilted neon "stamp" glyph + STAMPD. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 text-ink" aria-label="STAMPD home">
      <span
        aria-hidden
        className="grid h-8 w-8 -rotate-6 place-items-center rounded-lg bg-brand font-display text-sm font-extrabold text-brand-ink shadow-[0_0_22px_-4px_var(--brand)] transition group-hover:rotate-0"
      >
        S
      </span>
      <span className="font-display text-lg font-bold tracking-tight">
        STAMP<span className="text-accent">D</span>
      </span>
    </Link>
  );
}
