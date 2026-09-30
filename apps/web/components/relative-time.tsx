"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@stampd/core";
import { timeAgo } from "@/lib/format";

/**
 * Relative times ("45s", "29d 22h") differ between the server render and hydration, so the text
 * opts out of the hydration check and refreshes every 30s on the client.
 */
export function RelativeTime({ iso, mode = "ago" }: { iso: string; mode?: "ago" | "until" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {mode === "ago" ? timeAgo(iso, now) : formatCountdown(iso, now)}
    </time>
  );
}
