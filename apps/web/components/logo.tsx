import Image from "next/image";
import Link from "next/link";

/** Wordmark: the quill-S mark + "STAMPD Markets". */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-1.5 text-ink sm:gap-2" aria-label="STAMPD Markets home">
      <Image
        src="/logo-mark.png"
        alt=""
        width={36}
        height={36}
        priority
        className="h-8 w-8 drop-shadow-[0_0_10px_rgba(26,255,46,0.35)] transition group-hover:-rotate-6 sm:h-9 sm:w-9"
      />
      <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
        STAMPD <span className="hidden font-medium text-ink-2 min-[500px]:inline">Markets</span>
      </span>
    </Link>
  );
}
