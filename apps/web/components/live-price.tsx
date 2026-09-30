"use client";

import { useEffect, useRef, useState } from "react";
import { Counter } from "@stampd/ui";

/**
 * A price in cents that rolls from the old value to the new one (React Bits Counter) and flashes
 * --yes-bg / --no-bg for 600ms when it changes (development plan 1.5, 3.2c). Never starts at 0.
 */
export function LivePrice({ bps, side = "YES", height = 18 }: { bps: number; side?: "YES" | "NO"; height?: number }) {
  const cents = Math.round((side === "YES" ? bps : 10_000 - bps) / 100);
  const prev = useRef(cents);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    if (cents === prev.current) return;
    setFlash(cents > prev.current ? "flash-up" : "flash-down");
    prev.current = cents;
    const t = setTimeout(() => setFlash(""), 600);
    return () => clearTimeout(t);
  }, [cents]);

  return (
    <span className={`inline-flex rounded-[2px] font-mono ${flash}`}>
      <Counter value={cents} height={height} suffix="¢" />
    </span>
  );
}
