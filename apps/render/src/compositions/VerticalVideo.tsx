import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from "remotion";
import { z } from "zod";
import { TextLayerSlot } from "./TextLayerSlot.js";

/**
 * The real 1080x1920 vertical video composition (build script 8.4/8.5) —
 * real Remotion component shape, unrunnable in this environment: it needs
 * actual rendered shot/VO media files, which don't exist without a funded
 * video-provider API key (see docs/steps/STEP-08.md). `compose.ts`'s stub
 * compositor does not invoke this component; it produces a JSON
 * description of what this composition WOULD render, so downstream QC
 * checks (duration/aspect) still run against real numbers.
 *
 * A real Zod schema (Remotion 4.x's native prop-validation mechanism, also
 * what drives the Studio UI's prop controls), not just a TS interface.
 */
export const VerticalVideoPropsSchema = z.object({
  shotUrls: z.array(z.string()),
  shotDurationsSec: z.array(z.number()),
  voiceoverUrl: z.string().nullable(),
  textOverlayRef: z.string().nullable(),
});
export type VerticalVideoProps = z.infer<typeof VerticalVideoPropsSchema>;

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

export function VerticalVideo({ shotUrls, shotDurationsSec, voiceoverUrl, textOverlayRef }: VerticalVideoProps) {
  let startFrame = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {shotUrls.map((url, i) => {
        const durationInFrames = Math.round((shotDurationsSec[i] ?? 1) * VIDEO_FPS);
        const sequence = (
          <Sequence key={url} from={startFrame} durationInFrames={durationInFrames}>
            <OffthreadVideo src={url} />
          </Sequence>
        );
        startFrame += durationInFrames;
        return sequence;
      })}
      {voiceoverUrl && <Audio src={voiceoverUrl} />}
      <TextLayerSlot textOverlayRef={textOverlayRef} />
    </AbsoluteFill>
  );
}
