import type { BoundingBox } from "@velocity/text-engine";
import { OverlayText, type OverlayEnter, type OverlayExit } from "./OverlayText.js";

export interface LowerThirdProps {
  text: string;
  box: BoundingBox;
  enter: OverlayEnter;
  exit: OverlayExit;
  frameLuminance: number;
  durationInFrames: number;
  fontFamily: string;
}

/** Name/role/product callout (build script 8B.5) — bottom-left aligned, single line. */
export function LowerThird(props: LowerThirdProps) {
  return <OverlayText {...props} maxLines={1} anchor="lower_third" align="left" minFontSizePx={28} maxFontSizePx={44} />;
}
