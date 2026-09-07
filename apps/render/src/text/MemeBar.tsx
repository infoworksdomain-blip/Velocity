import type { BoundingBox } from "@velocity/text-engine";
import { OverlayText, type OverlayEnter, type OverlayExit } from "./OverlayText.js";

export interface MemeBarProps {
  text: string;
  box: BoundingBox;
  position: "top" | "bottom";
  enter: OverlayEnter;
  exit: OverlayExit;
  frameLuminance: number;
  durationInFrames: number;
  fontFamily: string;
}

/** Top or bottom solid bar with centred text — the meme content format's own text treatment (build script 8B.5), classic ALL CAPS impact styling. */
export function MemeBar({ position, ...props }: MemeBarProps) {
  return (
    <OverlayText
      {...props}
      text={props.text.toUpperCase()}
      maxLines={2}
      anchor={position === "top" ? "top" : "bottom"}
      align="center"
      minFontSizePx={48}
      maxFontSizePx={80}
      fillColorOverride="#FFFFFF"
      plateColorOverride="#000000"
    />
  );
}
