import type { BlueprintStructure, ContentFormat, Storyboard, StoryboardScene } from "@velocity/contracts";

/**
 * Beat timings come from the matched trend blueprint, not the model
 * (STEP 8.3/8.2) — the LLM chooses words, this function (and the
 * blueprint's own structure) chooses timing and shot count. When no
 * blueprint matched, a fixed default beat structure is used instead of
 * inventing arbitrary timings per call.
 */

const DEFAULT_BEAT_TIMINGS_MS = [0, 1500, 4000, 8000, 12000];

export interface BuildStoryboardInput {
  hook: string;
  productDescription: string;
  format: ContentFormat;
  blueprint: BlueprintStructure | null;
}

function sceneCountForFormat(format: ContentFormat): number {
  switch (format) {
    case "meme":
      return 1;
    case "slideshow":
      return 8;
    default:
      return 4;
  }
}

export function buildStoryboard(input: BuildStoryboardInput): Storyboard {
  const beatTimings = input.blueprint?.beatTimings.length ? input.blueprint.beatTimings : DEFAULT_BEAT_TIMINGS_MS;
  const sceneCount = Math.min(sceneCountForFormat(input.format), Math.max(1, beatTimings.length));

  const scenes: StoryboardScene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const startMs = beatTimings[i] ?? beatTimings[beatTimings.length - 1]!;
    const nextMs = beatTimings[i + 1] ?? startMs + 3000;
    const durationMs = Math.max(500, nextMs - startMs);

    scenes.push({
      durationMs,
      visualDirective: i === 0 ? `Hook shot establishing: ${input.hook}` : `Beat ${i}: showcase ${input.productDescription}`,
      onScreenText: i === 0 ? input.hook : undefined,
      voiceoverLine: i === 0 ? input.hook : undefined,
      transition: input.blueprint?.shotGrammar ?? undefined,
    });
  }

  return { scenes };
}
