import { ImageResponse } from "next/og";
import { formatEdge } from "@stampd/core";
import { serverGet } from "@/lib/api";
import type { KolStats } from "@/lib/types";
import { Dashed, Frame, Line, OG, OG_SIZE, ogOptions } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "KOL track record on STAMPD";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const d = await serverGet<{ kol: { handle: string; name: string; stats: KolStats | null } }>(`/kols/${encodeURIComponent(handle)}`, 300);
  const s = d?.kol.stats;
  const hit = s && s.resolved > 0 && s.hitRate !== null ? `${Math.round(s.hitRate * 100)}% hit · ${s.resolved} calls` : "no resolved calls yet";
  const edge = formatEdge(s?.avgEdge ?? null, s?.edgeN ?? 0);
  const name = d?.kol.name ?? handle;
  const options = await ogOptions(`STAMPDeverycallgetsareceiptdemomoney@${handle}${name}RECORDEDGELIVEVOID${hit}${edge}0123456789`);

  return new ImageResponse(
    (
      <Frame>
        <Dashed />
        <div style={{ display: "flex", fontFamily: "Newsreader", fontSize: 72, color: OG.ink, marginTop: 20 }}>{`@${handle}`}</div>
        <div style={{ display: "flex", fontSize: 28, color: OG.ink2, marginBottom: 24 }}>{name}</div>
        <Line label="RECORD" value={hit} />
        <Line label="EDGE" value={edge} />
        <Line label="LIVE" value={String(s?.live ?? 0)} />
        <Line label="VOID" value={String(s?.invalid ?? 0)} />
        <Dashed />
      </Frame>
    ),
    options,
  );
}
