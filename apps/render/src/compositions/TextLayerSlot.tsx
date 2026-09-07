import { useEffect, useState } from "react";
import { AbsoluteFill, cancelRender, continueRender, delayRender, Sequence, useVideoConfig } from "remotion";
import { TextPlanSchema, boxForPlatforms, type TextPlan, type SafeAreasConfig } from "@velocity/text-engine";
import { HookOverlay } from "../text/HookOverlay.js";
import { StickerText } from "../text/StickerText.js";
import { MemeBar } from "../text/MemeBar.js";
import { LowerThird } from "../text/LowerThird.js";
import { CTAEndCard } from "../text/CTAEndCard.js";
import { CaptionTrack, type CaptionWord } from "../text/CaptionTrack.js";

const FONT_FAMILY = "Geist Sans, system-ui, sans-serif";
/**
 * Real per-frame luminance sampling (build script 8B.5) needs pixel access
 * to the composed frame underneath each overlay at render time — a real
 * capability of Remotion's render pipeline, but one this sandbox cannot
 * exercise or verify without an actual render (same category as the
 * missing ffmpeg binary). `legibility.ts`'s luminance/contrast math is
 * real and fully tested (packages/text-engine); what's not yet wired is
 * the frame-pixel source feeding it here. A fixed mid-dark default keeps
 * this component's real shape complete and functional in the interim —
 * swapping in real per-frame sampling is a documented, self-contained
 * follow-up (see docs/steps/STEP-08B.md), not a silent gap.
 */
const DEFAULT_FRAME_LUMINANCE = 0.25;

export interface TextLayerSlotProps {
  textOverlayRef: string | null;
  targetPlatforms: ("tiktok" | "reels" | "shorts")[];
  safeAreasConfig: SafeAreasConfig;
  captionWords: CaptionWord[];
  brandLogoUrl: string | null;
}

/**
 * The 8B seam STEP 8 left, now filled: fetches the resolved TextPlan by
 * ref, validates it, computes the target safe box (the intersection across
 * every platform this render serves — 8B.5), and renders each overlay via
 * a `<Sequence>` keyed to its `startMs`/`endMs`, dispatching to the right
 * component by `role`. Still real-shape-only in this sandbox: it needs an
 * actual ref-resolving endpoint (fetching a text_plans row by id over
 * HTTPS — not yet built, a STEP 9+/12 concern) and a real browser render
 * context for `useCanvasMeasurer`/`delayRender` to mean anything.
 */
export function TextLayerSlot({ textOverlayRef, targetPlatforms, safeAreasConfig, captionWords, brandLogoUrl }: TextLayerSlotProps) {
  const { fps, width: frameWidth, height: frameHeight } = useVideoConfig();
  const [textPlan, setTextPlan] = useState<TextPlan | null>(null);
  const [handle] = useState(() => (textOverlayRef ? delayRender(`Resolve TextPlan ${textOverlayRef}`) : null));

  useEffect(() => {
    if (!textOverlayRef || handle === null) return;
    fetch(textOverlayRef)
      .then((res) => res.json())
      .then((raw: unknown) => {
        const parsed = TextPlanSchema.safeParse(raw);
        if (!parsed.success) throw new Error(`TextLayerSlot: resolved ref did not parse as a TextPlan: ${parsed.error.message}`);
        setTextPlan(parsed.data);
        continueRender(handle);
      })
      .catch((error: unknown) => cancelRender(error));
  }, [textOverlayRef]);

  if (!textOverlayRef || !textPlan) return null;

  const safeBox = boxForPlatforms(safeAreasConfig, textPlan.platformVariants.length > 0 ? textPlan.platformVariants : targetPlatforms);

  return (
    <AbsoluteFill>
      {textPlan.overlays.map((overlay) => {
        const fromFrame = Math.round((overlay.startMs / 1000) * fps);
        const durationInFrames = Math.max(1, Math.round(((overlay.endMs - overlay.startMs) / 1000) * fps));
        const shared = { box: safeBox, enter: overlay.enter, exit: overlay.exit, frameLuminance: DEFAULT_FRAME_LUMINANCE, durationInFrames, fontFamily: FONT_FAMILY };

        let content: React.ReactNode;
        switch (overlay.role) {
          case "hook":
            content = <HookOverlay text={overlay.text} align={overlay.align} {...shared} />;
            break;
          case "sticker":
            content = <StickerText text={overlay.text} align={overlay.align} {...shared} />;
            break;
          case "meme_bar":
            content = <MemeBar text={overlay.text} position={overlay.anchor === "bottom" ? "bottom" : "top"} {...shared} />;
            break;
          case "lower_third":
            content = <LowerThird text={overlay.text} {...shared} />;
            break;
          case "cta":
            content = <CTAEndCard text={overlay.text} box={safeBox} frameLuminance={DEFAULT_FRAME_LUMINANCE} durationInFrames={durationInFrames} fontFamily={FONT_FAMILY} brandLogoUrl={brandLogoUrl} />;
            break;
          case "beat":
          case "slide_title":
          default:
            content = <HookOverlay text={overlay.text} align={overlay.align} {...shared} />;
            break;
        }

        return (
          <Sequence key={overlay.id} from={fromFrame} durationInFrames={durationInFrames}>
            {content}
          </Sequence>
        );
      })}

      {textPlan.captionTrack.enabled && captionWords.length > 0 && <CaptionTrack words={captionWords} wordsPerGroup={textPlan.captionTrack.wordsPerGroup} box={safeBox} fontFamily={FONT_FAMILY} />}

      {textPlan.cta.text && textPlan.cta.endMs > textPlan.cta.startMs && (
        <Sequence from={Math.round((textPlan.cta.startMs / 1000) * fps)} durationInFrames={Math.max(1, Math.round(((textPlan.cta.endMs - textPlan.cta.startMs) / 1000) * fps))}>
          <CTAEndCard text={textPlan.cta.text} box={safeBox} frameLuminance={DEFAULT_FRAME_LUMINANCE} durationInFrames={fps} fontFamily={FONT_FAMILY} brandLogoUrl={brandLogoUrl} />
        </Sequence>
      )}

      <div hidden aria-hidden data-frame-dimensions={`${frameWidth}x${frameHeight}`} />
    </AbsoluteFill>
  );
}
