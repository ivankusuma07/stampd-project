// Adapted from React Bits (SplitFlapText, TS + Tailwind) — https://reactbits.dev — MIT + Commons Clause.
// STAMPD changes (development plan 1.8): value-driven instead of cycling a word list — when
// `value` changes, the tiles flip once from the old text to the new one (loop off). Flat tiles in
// --surface with a 1px --rule border, text in --ink, IBM Plex Mono, radius 4: the original's
// gradients, inset shadows and text-shadow are removed. Numeric charset. Reduced motion: no flip.
"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useCalm } from "../reduced";

type Tile = { current: string; next: string; flipping: boolean; tick: number };

const CHARSET = "0123456789";
const STYLES = `
.sft{font-family:var(--font-mono),ui-monospace,monospace;font-variant-numeric:tabular-nums;line-height:1}
.sft__tile{position:relative;width:.72em;height:1.12em;overflow:hidden;border-radius:4px;background:var(--surface);border:1px solid var(--rule);perspective:520px;transform-style:preserve-3d}
.sft__tile:before{content:'';position:absolute;z-index:8;top:calc(50% - .5px);left:0;width:100%;height:1px;background:var(--rule);pointer-events:none}
.sft__half,.sft__flap{position:absolute;left:0;width:100%;height:50%;overflow:hidden;background:var(--surface);backface-visibility:hidden}
.sft__half--top,.sft__flap--front{top:0}
.sft__half--bottom,.sft__flap--back{bottom:0}
.sft__char{position:absolute;left:0;width:100%;height:200%;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.sft__half--top .sft__char,.sft__flap--front .sft__char{top:0}
.sft__half--bottom .sft__char,.sft__flap--back .sft__char{bottom:0}
.sft__flap{z-index:6;will-change:transform}
.sft__flap--front{transform-origin:center bottom;animation:sft-front var(--sft-flip) cubic-bezier(.23,1,.32,1) both}
.sft__flap--back{transform-origin:center top;transform:rotateX(90deg);animation:sft-back var(--sft-flip) cubic-bezier(.23,1,.32,1) both}
@keyframes sft-front{0%{transform:rotateX(0)}100%{transform:rotateX(-90deg)}}
@keyframes sft-back{0%,45%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}
@media (prefers-reduced-motion:reduce){.sft__flap{animation:none!important}}
`;

const tilesOf = (text: string): Tile[] => text.split("").map((c) => ({ current: c, next: c, flipping: false, tick: 0 }));
const nbsp = (c: string) => (c === " " ? " " : c);

export type SplitFlapTextProps = {
  /** the text to show; changing it flips the tiles once */
  value: string;
  /** seconds per flip step */
  flipDuration?: number;
  /** random intermediate characters per tile (keeps the whole flip about 1s) */
  flipsPerChar?: number;
  stagger?: number;
  fontSize?: number | string;
  className?: string;
};

export default function SplitFlapText({
  value,
  flipDuration = 0.09,
  flipsPerChar = 6,
  stagger = 0.05,
  fontSize = 36,
  className = "",
}: SplitFlapTextProps) {
  const calm = useCalm();
  const width = value.length;
  const [tiles, setTiles] = useState<Tile[]>(() => tilesOf(value));
  const shown = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = shown.current.padStart(width, " ").slice(-width);
    const to = value;
    if (raf.current) cancelAnimationFrame(raf.current);
    if (calm || from === to) {
      shown.current = to;
      setTiles(tilesOf(to));
      return;
    }
    const flipMs = flipDuration * 1000;
    const plans = to
      .split("")
      .map((target, index) => {
        const start = from[index] ?? " ";
        if (start === target) return null;
        const seq = Array.from({ length: flipsPerChar }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]!);
        seq.push(target);
        return { index, from: start, target, seq, start: index * stagger * 1000, step: -1, done: false };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    setTiles((prev) => (prev.length === width ? prev : tilesOf(from)));
    const t0 = performance.now();
    const tick = (now: number) => {
      const updates: { index: number; current: string; next: string; done: boolean }[] = [];
      let more = false;
      for (const p of plans) {
        const local = now - t0 - p.start;
        if (local < 0) {
          more = true;
          continue;
        }
        const step = Math.floor(local / flipMs);
        if (step < p.seq.length) {
          more = true;
          if (step !== p.step) {
            p.step = step;
            updates.push({ index: p.index, current: step === 0 ? p.from : p.seq[step - 1]!, next: p.seq[step]!, done: false });
          }
        } else if (!p.done) {
          p.done = true;
          updates.push({ index: p.index, current: p.target, next: p.target, done: true });
        }
      }
      if (updates.length) {
        setTiles((prev) => {
          const next = [...prev];
          for (const u of updates) {
            const t = next[u.index];
            if (t) next[u.index] = { current: u.current, next: u.next, flipping: !u.done, tick: t.tick + 1 };
          }
          return next;
        });
      }
      if (more) raf.current = requestAnimationFrame(tick);
      else shown.current = to;
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, width, calm, flipDuration, flipsPerChar, stagger]);

  const style = {
    fontSize: typeof fontSize === "number" ? `${fontSize}px` : fontSize,
    "--sft-flip": `${flipDuration}s`,
  } as CSSProperties;

  return (
    <>
      <style>{STYLES}</style>
      <span className={`sft inline-flex items-center gap-[3px] whitespace-pre select-none ${className}`} style={style}>
        <span className="sr-only">{value}</span>
        {tiles.map((tile, i) => (
          <span className="sft__tile" aria-hidden key={`${i}-${tiles.length}`}>
            <span className="sft__half sft__half--top">
              <span className="sft__char">{nbsp(tile.current)}</span>
            </span>
            <span className="sft__half sft__half--bottom">
              <span className="sft__char">{nbsp(tile.flipping ? tile.next : tile.current)}</span>
            </span>
            {tile.flipping ? (
              <>
                <span className="sft__flap sft__flap--front" key={`f-${tile.tick}`}>
                  <span className="sft__char">{nbsp(tile.current)}</span>
                </span>
                <span className="sft__flap sft__flap--back" key={`b-${tile.tick}`}>
                  <span className="sft__char">{nbsp(tile.next)}</span>
                </span>
              </>
            ) : null}
          </span>
        ))}
      </span>
    </>
  );
}
