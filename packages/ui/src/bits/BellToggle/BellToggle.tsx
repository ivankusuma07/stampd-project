// Adapted from React Bits (BellToggle, TS + Tailwind) — https://reactbits.dev — MIT + Commons Clause.
// STAMPD changes (development plan 1.6 #6, 1.8): kept the decaying ring swing and the count badge;
// removed the on/off label crossfade, the sound waves (waves={false}) and the toggle state, because
// this bell opens a dropdown. Lucide `Bell` instead of Hugeicons. Badge is --ink on --mark. It
// rings once when the unread count goes up; never under reduced motion.
"use client";

import { Bell } from "lucide-react";
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes } from "react";
import { useCalm } from "../reduced";

const SEG_EASE = "cubic-bezier(0.77, 0, 0.175, 1)";
const WARP = 0.6;
const passOffset = (k: number, passes: number) => 1 - Math.pow(1 - (k + 2 / 3) / (passes + 1), WARP);

function ringKeyframes(amplitude: number, passes: number): Keyframe[] {
  const frames: Keyframe[] = [{ transform: "rotate(0deg)", offset: 0, easing: SEG_EASE }];
  for (let k = 0; k < passes; k++) {
    const angle = amplitude * (1 - k / passes) * (k % 2 ? 1 : -1);
    frames.push({ transform: `rotate(${angle.toFixed(2)}deg)`, offset: passOffset(k, passes), easing: SEG_EASE });
  }
  frames.push({ transform: "rotate(0deg)", offset: 1 });
  return frames;
}

export type BellToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & { count: number };

const BellToggle = forwardRef<HTMLButtonElement, BellToggleProps>(function BellToggle(
  { count, className = "", ...props },
  ref,
) {
  const calm = useCalm();
  const glyph = useRef<HTMLSpanElement>(null);
  const prev = useRef(count);

  useEffect(() => {
    const was = prev.current;
    prev.current = count;
    if (count > was && !calm && glyph.current) {
      glyph.current.getAnimations().forEach((a) => a.cancel());
      glyph.current.animate(ringKeyframes(17, 5), { duration: 600, easing: "linear" });
    }
  }, [count, calm]);

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`relative inline-grid h-9 w-9 place-items-center rounded-[4px] text-[var(--ink)] hover:bg-[var(--rule)]/40 ${className}`}
      {...props}
    >
      <span ref={glyph} className="inline-grid origin-[50%_16%]" aria-hidden>
        <Bell size={20} strokeWidth={1.5} />
      </span>
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-[4px] bg-[var(--mark)] px-1 font-mono text-[10px] leading-none font-semibold text-[var(--mark-ink)]"
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </button>
  );
});

export default BellToggle;
