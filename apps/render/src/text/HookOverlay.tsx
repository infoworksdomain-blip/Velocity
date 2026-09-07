import type { BoundingBox } from "@velocity/text-engine";
import { OverlayText, type OverlayAlign, type OverlayEnter, type OverlayExit } from "./OverlayText.js";

export interface HookOverlayProps {
  text: string;
  box: BoundingBox;
  align: OverlayAlign;
  enter: OverlayEnter;
  exit: OverlayExit;
  frameLuminance: number;
  durationInFrames: number;
  fontFamily: string;
}

/** The opening hook — upper-third by default, auto-fitted, 2 lines max (build script 8B.5). */
export function HookOverlay(props: HookOverlayProps) {
  return <OverlayText {...props} maxLines={2} anchor="upper_third" minFontSizePx={44} maxFontSizePx={88} />;
}
