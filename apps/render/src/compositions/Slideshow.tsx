import { AbsoluteFill, Img, Sequence } from "remotion";
import { z } from "zod";
import { SafeAreasConfigSchema } from "@velocity/text-engine";
import { ContentPlatformVariantSchema } from "@velocity/contracts";
import { TextLayerSlot } from "./TextLayerSlot.js";
import { CaptionWordSchema } from "./caption-word.schema.js";
import { VIDEO_FPS } from "./VerticalVideo.js";

/**
 * The slideshow format (build script 8.5) — generated images + per-slide
 * overlay text, exported as an image SET, not a video (TikTok photo posts
 * are URL-pull only). Real Remotion shape, unrunnable here for the same
 * reason as VerticalVideo — see that file's header comment.
 */
export const SlideshowPropsSchema = z.object({
  slideUrls: z.array(z.string()),
  slideDurationsSec: z.array(z.number()),
  textOverlayRef: z.string().nullable(),
  targetPlatforms: z.array(ContentPlatformVariantSchema),
  safeAreasConfig: SafeAreasConfigSchema,
  captionWords: z.array(CaptionWordSchema),
  brandLogoUrl: z.string().nullable(),
});
export type SlideshowProps = z.infer<typeof SlideshowPropsSchema>;

export function Slideshow({ slideUrls, slideDurationsSec, textOverlayRef, targetPlatforms, safeAreasConfig, captionWords, brandLogoUrl }: SlideshowProps) {
  let startFrame = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff" }}>
      {slideUrls.map((url, i) => {
        const durationInFrames = Math.round((slideDurationsSec[i] ?? 3) * VIDEO_FPS);
        const sequence = (
          <Sequence key={url} from={startFrame} durationInFrames={durationInFrames}>
            <Img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        );
        startFrame += durationInFrames;
        return sequence;
      })}
      <TextLayerSlot textOverlayRef={textOverlayRef} targetPlatforms={targetPlatforms} safeAreasConfig={safeAreasConfig} captionWords={captionWords} brandLogoUrl={brandLogoUrl} />
    </AbsoluteFill>
  );
}
