"use client";

import { useReducedMotion } from "motion/react";

/**
 * Shared reduced-motion check for the animated pieces that don't handle it themselves
 * (development plan 3.2b: Counter, AnimatedList, FadeContent, Noise). `true` means: render the
 * final state with no movement.
 */
export function useCalm(): boolean {
  return useReducedMotion() ?? false;
}
