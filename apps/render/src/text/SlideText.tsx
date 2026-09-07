import { AbsoluteFill } from "remotion";
import type { BoundingBox } from "@velocity/text-engine";
import { useOverlayLayout } from "./use-overlay-layout.js";

export interface SlideTextProps {
  title: string;
  body: string;
  box: BoundingBox;
  frameLuminance: number;
  fontFamily: string;
}

/** Per-slide title and body for the slideshow format (build script 8B.5). */
export function SlideText({ title, body, box, frameLuminance, fontFamily }: SlideTextProps) {
  const titleLayout = useOverlayLayout({ text: title, maxLines: 2, box, minFontSizePx: 36, maxFontSizePx: 64, fontFamily, frameLuminance });
  const bodyLayout = useOverlayLayout({ text: body, maxLines: 3, box, minFontSizePx: 24, maxFontSizePx: 36, fontFamily, frameLuminance });
  const isLight = titleLayout.treatment === "light_text_dark_stroke";
  const color = isLight ? "#FFFFFF" : "#101012";

  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "flex-end", paddingBottom: "12%", paddingLeft: "8%" }}>
      <div style={{ maxWidth: box.right - box.left, fontFamily }}>
        <div style={{ fontSize: titleLayout.fontSizePx, fontWeight: 700, color, marginBottom: "0.4em" }}>
          {titleLayout.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div style={{ fontSize: bodyLayout.fontSizePx, fontWeight: 400, color }}>
          {bodyLayout.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
