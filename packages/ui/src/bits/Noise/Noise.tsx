// Adapted from React Bits (Noise, TS + Tailwind) — https://reactbits.dev — MIT + Commons Clause.
// STAMPD changes (development plan 1.8): the grain is drawn ONCE into a small tile and repeated
// as a CSS background, instead of redrawing a full-screen canvas every 2 frames. Fixed,
// pointer-events: none, aria-hidden. Static, so reduced motion needs no special case.
"use client";

import { useEffect, useState } from "react";

export type NoiseProps = {
  /** alpha of each grain pixel, 0–255 (plan: 8–10) */
  patternAlpha?: number;
  tileSize?: number;
};

export default function Noise({ patternAlpha = 9, tileSize = 160 }: NoiseProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = tileSize;
    canvas.height = tileSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(tileSize, tileSize);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = patternAlpha;
    }
    ctx.putImageData(img, 0, 0);
    setUrl(canvas.toDataURL("image/png"));
  }, [patternAlpha, tileSize]);

  if (!url) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{ backgroundImage: `url(${url})`, backgroundRepeat: "repeat", imageRendering: "pixelated" }}
    />
  );
}
