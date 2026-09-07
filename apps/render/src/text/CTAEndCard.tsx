import { AbsoluteFill } from "remotion";
import type { BoundingBox } from "@velocity/text-engine";
import { OverlayText } from "./OverlayText.js";

export interface CTAEndCardProps {
  text: string;
  box: BoundingBox;
  frameLuminance: number;
  durationInFrames: number;
  fontFamily: string;
  brandLogoUrl: string | null;
}

/**
 * Final 1-2 seconds: brand mark plus action (build script 8B.5). C8's own
 * constraint applies here directly — `brandLogoUrl` is always the
 * CUSTOMER's brand asset (from brand_profiles.visual.logoUrl), never a
 * VELOCITY mark; this component has no path to render anything else.
 */
export function CTAEndCard({ text, box, frameLuminance, durationInFrames, fontFamily, brandLogoUrl }: CTAEndCardProps) {
  return (
    <AbsoluteFill>
      {brandLogoUrl && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: "30%" }}>
          <img src={brandLogoUrl} alt="" style={{ maxWidth: 160, maxHeight: 160, objectFit: "contain" }} />
        </AbsoluteFill>
      )}
      <OverlayText text={text} maxLines={1} box={box} anchor="center" align="center" enter="pop" exit="cut" minFontSizePx={40} maxFontSizePx={64} fontFamily={fontFamily} frameLuminance={frameLuminance} durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
}
