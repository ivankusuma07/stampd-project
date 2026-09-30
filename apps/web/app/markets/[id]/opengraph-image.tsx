import { ImageResponse } from "next/og";
import { formatCents, formatDateUtc, shortHash } from "@stampd/core";
import { serverGet } from "@/lib/api";
import type { MarketDetail } from "@/lib/types";
import { Dashed, Frame, Line, OG, OG_SIZE, ogOptions } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "STAMPD market receipt";

/**
 * Receipt card (development plan 6.2): the live version shows the current YES price and close
 * date; once resolved it shows the stamp, final price and settlement tx. Static by design.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await serverGet<MarketDetail>(`/markets/${id}`, 60);
  if (!d) {
    return new ImageResponse(<Frame>{<div style={{ display: "flex", marginTop: 120, fontSize: 48 }}>Market not found</div>}</Frame>, size);
  }
  const m = d.market;
  const stamp = !m.result ? null : m.result === "INVALID" ? "VOID" : m.result === m.kolSide ? "CALLED IT" : "MISSED";
  const finalBps = m.result === "YES" ? 10_000 : m.result === "NO" ? 0 : m.result === "INVALID" ? 5_000 : m.yesPriceBps;
  const question = m.question.length > 120 ? `${m.question.slice(0, 117)}…` : m.question;

  const text = `STAMPDeverycallgetsareceiptdemomoney${question}@${m.kol.handle}CALLQUESTIONCALLEDRESULTPRICEFINALCLOSESSETTLEDopenedtx0123456789¢·→ ${stamp ?? ""}${formatDateUtc(m.closeTime)}YESNOINVALIDVOID[]`;
  const options = await ogOptions(text);

  return new ImageResponse(
    (
      <Frame>
        <Dashed />
        <Line label="CALL" value={`@${m.kol.handle}${d.post ? ` · ${formatDateUtc(d.post.postedAt)}` : ""}`} />
        <div style={{ display: "flex", flexShrink: 0, fontFamily: "Newsreader", fontSize: 44, lineHeight: 1.18, color: OG.ink, margin: "16px 0 12px" }}>
          {question}
        </div>
        <Line label="CALLED" value={m.kolSide} color={m.kolSide === "YES" ? OG.yes : OG.no} />
        {/* Satori lays fragments out as a row; group lines in a column */}
        {m.result ? (
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <Line label="RESULT" value={m.result} />
            <Line label="FINAL" value={`${formatCents(finalBps)} · opened ${formatCents(m.openingYesPriceBps)}`} />
            {m.settledTxHash ? <Line label="SETTLED" value={`tx ${shortHash(m.settledTxHash)}`} /> : null}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <Line label="PRICE" value={`YES ${formatCents(m.yesPriceBps)} · NO ${formatCents(10_000 - m.yesPriceBps)}`} />
            <Line label="CLOSES" value={formatDateUtc(m.closeTime)} />
          </div>
        )}
        <Dashed />
        {stamp ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                display: "flex",
                background: OG.mark,
                color: OG.ink,
                border: `3px solid ${OG.ink}`,
                padding: "6px 18px",
                fontSize: 40,
                letterSpacing: 6,
                transform: "rotate(-2deg)",
              }}
            >
              {`[${stamp}]`}
            </div>
          </div>
        ) : null}
      </Frame>
    ),
    options,
  );
}
