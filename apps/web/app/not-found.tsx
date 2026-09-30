import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-mono text-sm text-ink-3">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">No receipt for that</h1>
      <p className="mt-2 text-ink-2">The page or market doesn&apos;t exist, or hasn&apos;t gone live yet.</p>
      <Link href="/markets" className="mt-4 inline-block underline">
        Browse markets
      </Link>
    </div>
  );
}
