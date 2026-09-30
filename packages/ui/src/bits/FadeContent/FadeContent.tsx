// Adapted from React Bits (FadeContent, TS + Tailwind) — https://reactbits.dev — MIT + Commons Clause.
// STAMPD changes: ported from gsap + ScrollTrigger to motion's in-view animation, so the app
// ships one animation library (motion budget, development plan 1.8). Settings from the plan:
// 12px rise, 400ms, runs once, off under reduced motion. No blur.
"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useCalm } from "../reduced";

export type FadeContentProps = { children: ReactNode; className?: string; delay?: number };

export default function FadeContent({ children, className = "", delay = 0 }: FadeContentProps) {
  const calm = useCalm();
  if (calm) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
