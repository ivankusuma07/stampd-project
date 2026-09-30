// Adapted from React Bits (AnimatedList, TS + Tailwind) — https://reactbits.dev — MIT + Commons Clause.
// STAMPD changes: kept the enter animation only. The original listens for Tab/arrow keys on the
// whole window and calls preventDefault, which breaks keyboard navigation for the rest of the
// page, so that is gone; items are ordinary focusable children. Scroll fades (gradients) removed.
// New rows slide in; nothing animates under reduced motion.
"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useCalm } from "../reduced";

export type AnimatedListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  render: (item: T) => ReactNode;
  className?: string;
};

export default function AnimatedList<T>({ items, getKey, render, className = "" }: AnimatedListProps<T>) {
  const calm = useCalm();
  if (calm) {
    return (
      <ul className={className}>
        {items.map((item) => (
          <li key={getKey(item)}>{render(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={className}>
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.li
            key={getKey(item)}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            {render(item)}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
