import type { ReactNode } from "react";

/** Colours for share images (CSS variables don't exist inside Satori). Light theme, plan 1.3. */
export const OG = {
  paper: "#F6F4EE",
  surface: "#FFFFFF",
  ink: "#16140F",
  ink2: "#4A463D",
  ink3: "#6B665A",
  rule: "#8A8475",
  yes: "#0B7449",
  no: "#B3262E",
  mark: "#FFD23F",
} as const;

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * Fetch a Google font for Satori, which reads TTF/OTF/WOFF but not WOFF2 — an old user agent makes
 * Google serve one of those. Only the glyphs in `text` are requested. Returns null on any failure
 * (4s timeout each) so the image still renders with the default font.
 */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 Safari/533.21.1" },
        signal: AbortSignal.timeout(4_000),
      })
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype|woff)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url, { signal: AbortSignal.timeout(4_000) })).arrayBuffer();
  } catch {
    return null;
  }
}

export async function ogFonts(text: string) {
  const [serif, mono] = await Promise.all([googleFont("Newsreader", 600, text), googleFont("IBM+Plex+Mono", 500, text)]);
  const fonts: { name: string; data: ArrayBuffer; weight: 500 | 600; style: "normal" }[] = [];
  if (serif) fonts.push({ name: "Newsreader", data: serif, weight: 600, style: "normal" });
  if (mono) fonts.push({ name: "Plex Mono", data: mono, weight: 500, style: "normal" });
  return fonts;
}

/** ImageResponse options: omit `fonts` when none loaded, so Satori falls back to its default. */
export async function ogOptions(text: string) {
  const fonts = await ogFonts(text);
  return fonts.length > 0 ? { ...OG_SIZE, fonts } : OG_SIZE;
}

/**
 * One receipt line. Satori makes every text node its own flex item, so values must be a single
 * string, and rows must not shrink (Satori's flex items shrink by default).
 */
export function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexShrink: 0, fontFamily: "Plex Mono", fontSize: 26, color: color ?? OG.ink, marginTop: 6 }}>
      <div style={{ width: 190, color: OG.ink3 }}>{label}</div>
      <div style={{ display: "flex" }}>{value}</div>
    </div>
  );
}

export function Dashed() {
  return <div style={{ display: "flex", flexShrink: 0, borderTop: `2px dashed ${OG.rule}`, width: "100%", margin: "18px 0" }} />;
}

export function Frame({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: OG.paper, padding: "48px 64px", fontFamily: "Plex Mono" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontFamily: "Newsreader", fontSize: 44, color: OG.ink }}>STAMPD</div>
        <div style={{ fontSize: 22, color: OG.ink3 }}>every call gets a receipt · demo money</div>
      </div>
      {children}
    </div>
  );
}
