/**
 * Link to STAMPD's X account. Hidden until NEXT_PUBLIC_X_URL is set, so nothing points at the wrong
 * account. The X mark is the official brand logo as inline SVG: lucide (our icon set) has no brand
 * logos, and its `X` icon is a close cross.
 */
const X_URL = process.env.NEXT_PUBLIC_X_URL;

export function XLogo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * Round icon button, same size and style as the header's theme toggle. `display` sets the CSS display
 * (default "grid"); the header passes "hidden sm:grid" to keep phones roomy.
 */
export function XIconButton({ display = "grid" }: { display?: string }) {
  if (!X_URL) return null;
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="STAMPD on X"
      title="STAMPD on X"
      className={`${display} h-10 w-10 shrink-0 place-items-center rounded-full border border-rule bg-surface/60 text-ink-2 transition hover:border-rule-strong hover:text-ink`}
    >
      <XLogo size={15} />
    </a>
  );
}

/** Footer row: the X mark with the handle text. */
export function XFooterLink() {
  if (!X_URL) return null;
  const handle = X_URL.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").replace(/\/$/, "");
  return (
    <a href={X_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-ink-2 hover:text-accent">
      <span className="grid h-8 w-8 place-items-center rounded-full border border-rule bg-surface/60">
        <XLogo size={14} />
      </span>
      Follow @{handle} on X
    </a>
  );
}
