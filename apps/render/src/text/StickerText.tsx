import type { BoundingBox } from "@velocity/text-engine";
import { OverlayText, type OverlayAlign, type OverlayEnter, type OverlayExit } from "./OverlayText.js";

export interface StickerTextProps {
  text: string;
  box: BoundingBox;
  align: OverlayAlign;
  enter: OverlayEnter;
  exit: OverlayExit;
  frameLuminance: number;
  durationInFrames: number;
  fontFamily: string;
  rotationDeg?: number;
}

/** Rotated, offset "handwritten note" style label (build script 8B.5). */
export function StickerText({ rotationDeg = -6, ...props }: StickerTextProps) {
  return (
    <div style={{ position: "absolute", inset: 0, transform: `rotate(${rotationDeg}deg)` }}>
      <OverlayText {...props} maxLines={2} anchor="center" minFontSizePx={32} maxFontSizePx={56} plateColorOverride="#FFF4D6" fillColorOverride="#101012" />
    </div>
  );
}
