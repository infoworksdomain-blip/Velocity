import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { BoundingBox } from "@velocity/text-engine";
import { useOverlayLayout } from "./use-overlay-layout.js";

export type OverlayAnchor = "top" | "upper_third" | "center" | "lower_third" | "bottom";
export type OverlayAlign = "left" | "center" | "right";
export type OverlayEnter = "cut" | "pop" | "slide_up" | "typewriter" | "word_by_word";
export type OverlayExit = "cut" | "fade" | "slide_down";

export interface OverlayTextProps {
  text: string;
  maxLines: number;
  box: BoundingBox;
  anchor: OverlayAnchor;
  align: OverlayAlign;
  enter: OverlayEnter;
  exit: OverlayExit;
  minFontSizePx: number;
  maxFontSizePx: number;
  fontFamily: string;
  frameLuminance: number;
  /** Frame-local, not absolute — the parent's `<Sequence>` already offsets time, so this component only ever sees 0..durationInFrames-1. */
  durationInFrames: number;
  fillColorOverride?: string;
  plateColorOverride?: string;
}

const ANCHOR_STYLE: Record<OverlayAnchor, React.CSSProperties> = {
  top: { alignItems: "flex-start", justifyContent: "center" },
  upper_third: { alignItems: "flex-start", justifyContent: "center", paddingTop: "20%" },
  center: { alignItems: "center", justifyContent: "center" },
  lower_third: { alignItems: "flex-end", justifyContent: "center", paddingBottom: "20%" },
  bottom: { alignItems: "flex-end", justifyContent: "center" },
};

const ENTER_EXIT_FRAMES = 10;

function useEnterExitStyle(enter: OverlayEnter, exit: OverlayExit, durationInFrames: number): React.CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enterFrames = Math.min(ENTER_EXIT_FRAMES, Math.floor(durationInFrames / 3));

  if (enter === "cut" && exit === "cut") return {};

  const enterProgress = enter === "cut" ? 1 : interpolate(frame, [0, enterFrames], [0, 1], { extrapolateRight: "clamp" });
  const exitStart = durationInFrames - enterFrames;
  const exitProgress = exit === "cut" ? 1 : interpolate(frame, [exitStart, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = Math.min(enterProgress, exit === "fade" ? exitProgress : 1);

  const translateY =
    enter === "slide_up" ? interpolate(enterProgress, [0, 1], [24, 0]) : exit === "slide_down" ? interpolate(exitProgress, [0, 1], [0, 24]) : 0;
  const scale = enter === "pop" ? interpolate(enterProgress, [0, 1], [0.85, 1]) : 1;

  void fps;
  return { opacity, transform: `translateY(${translateY}px) scale(${scale})` };
}

/**
 * The shared renderer behind HookOverlay/StickerText/MemeBar/LowerThird/
 * CTAEndCard — all five are "a style preset applied to positioned text,"
 * differing only in their defaults (see each file). Font size and line
 * break come from `useOverlayLayout` (real auto-fit against real canvas
 * metrics); this component only applies the result.
 */
export function OverlayText({ text, maxLines, box, anchor, align, enter, exit, minFontSizePx, maxFontSizePx, fontFamily, frameLuminance, durationInFrames, fillColorOverride, plateColorOverride }: OverlayTextProps) {
  const { fontSizePx, lines, treatment } = useOverlayLayout({ text, maxLines, box, minFontSizePx, maxFontSizePx, fontFamily, frameLuminance });
  const animatedStyle = useEnterExitStyle(enter, exit, durationInFrames);

  const isLight = treatment === "light_text_dark_stroke";
  const fillColor = fillColorOverride ?? (isLight ? "#FFFFFF" : "#101012");
  const textShadow = isLight ? "0 1px 3px rgba(0,0,0,0.65), 0 0 8px rgba(0,0,0,0.45)" : "none";
  const plateColor = plateColorOverride ?? (isLight ? "transparent" : "rgba(255,255,255,0.92)");

  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", ...ANCHOR_STYLE[anchor] }}>
      <div
        style={{
          maxWidth: box.right - box.left,
          padding: plateColor === "transparent" ? 0 : "0.4em 0.7em",
          borderRadius: 12,
          backgroundColor: plateColor,
          textAlign: align,
          fontFamily,
          fontSize: fontSizePx,
          fontWeight: 700,
          lineHeight: 1.3,
          color: fillColor,
          textShadow,
          ...animatedStyle,
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
