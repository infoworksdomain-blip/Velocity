import type { CompositionOutput, ComposeSpec } from "@velocity/contracts";
import type { BlobStore } from "../storage/blob-store.js";
import type { Compositor } from "./compositor.js";

function parseResolution(resolution: string): { widthPx: number; heightPx: number } {
  const [width, height] = resolution.split("x").map(Number);
  if (!width || !height) throw new Error(`Invalid resolution string: ${resolution}`);
  return { widthPx: width, heightPx: height };
}

/**
 * Writes a JSON composition manifest describing what a real Remotion
 * render would have produced (shot refs, VO ref, text overlay ref,
 * resolution, duration) instead of actual video bytes — no ffmpeg, no
 * Lambda available in this environment. The dimensions and duration in
 * the returned CompositionOutput are real numbers derived from the spec,
 * not placeholders, so QC's duration/aspect checks downstream exercise
 * real logic against real values.
 */
export class StubCompositor implements Compositor {
  constructor(private readonly blobStore: BlobStore) {}

  async compose(spec: ComposeSpec): Promise<CompositionOutput> {
    const { widthPx, heightPx } = parseResolution(spec.targetResolution);
    const durationMs = Math.round(spec.targetDurationSec * 1000);
    const outputStorageKey = `stub-composition/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;

    await this.blobStore.put(
      outputStorageKey,
      JSON.stringify({
        shotOutputRefs: spec.shotOutputRefs,
        voiceoverOutputRef: spec.voiceoverOutputRef,
        textOverlayRef: spec.textOverlayRef,
        widthPx,
        heightPx,
        durationMs,
      }),
    );

    return {
      outputStorageKey,
      widthPx,
      heightPx,
      durationMs,
      hasAudio: spec.voiceoverOutputRef !== null,
    };
  }
}
