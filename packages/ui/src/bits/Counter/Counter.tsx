// Adapted from React Bits (Counter, TS + Tailwind) — https://reactbits.dev — MIT + Commons Clause.
// STAMPD changes: gradient masks removed (development plan 1.2); integer-only; each digit is its
// own component so hooks never run conditionally; plain text under reduced motion; the value
// always rolls from the previous value, never from 0.
"use client";

import { motion, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect } from "react";
import { useCalm } from "../reduced";

function Numeral({ mv, n, height }: { mv: MotionValue<number>; n: number; height: number }) {
  const y = useTransform(mv, (latest) => {
    const place = latest % 10;
    const offset = (10 + n - place) % 10;
    return (offset > 5 ? offset - 10 : offset) * height;
  });
  return (
    <motion.span style={{ y }} className="absolute inset-0 flex items-center justify-center">
      {n}
    </motion.span>
  );
}

function Digit({ value, place, height }: { value: number; place: number; height: number }) {
  const rounded = Math.floor(value / place);
  const mv = useSpring(rounded, { stiffness: 260, damping: 32 });
  useEffect(() => mv.set(rounded), [mv, rounded]);
  return (
    <span className="relative inline-flex w-[1ch] overflow-hidden" style={{ height }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Numeral key={i} mv={mv} n={i} height={height} />
      ))}
    </span>
  );
}

export type CounterProps = {
  /** a non-negative integer, e.g. a price in cents */
  value: number;
  /** line height of one digit in px */
  height?: number;
  suffix?: string;
  className?: string;
};

export default function Counter({ value, height = 20, suffix = "", className = "" }: CounterProps) {
  const calm = useCalm();
  const v = Math.max(0, Math.round(value));
  if (calm) {
    return (
      <span className={`tabular-nums ${className}`}>
        {v}
        {suffix}
      </span>
    );
  }
  const places = Array.from({ length: Math.max(1, String(v).length) }, (_, i) => 10 ** (String(v).length - 1 - i));
  return (
    <span className={`inline-flex items-center tabular-nums ${className}`} style={{ lineHeight: `${height}px` }}>
      <span className="sr-only">
        {v}
        {suffix}
      </span>
      <span aria-hidden className="inline-flex">
        {places.map((place) => (
          <Digit key={place} value={v} place={place} height={height} />
        ))}
        {suffix}
      </span>
    </span>
  );
}
