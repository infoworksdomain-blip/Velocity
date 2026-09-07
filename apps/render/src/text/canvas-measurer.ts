import type { TextMeasurer } from "@velocity/text-engine";

/**
 * The REAL production measurer (build script 8B.5: "Measure with canvas
 * measureText against the loaded font at render time"). Runs inside
 * Remotion's actual render context — a real Chromium, whether Remotion
 * Studio or a headless Lambda render — which this Node-only monorepo
 * sandbox does not have (`document` does not exist here; confirmed
 * directly, same category of gap as the missing ffmpeg binary and the
 * unfunded C2PA signing certificate). @velocity/text-engine's
 * `createHeuristicMeasurer()` stands in for this one during the
 * validation/repair loop's pre-flight check (a worker-side, Node-only
 * concern); THIS measurer is what actually decides on-screen layout at
 * render time, and only this one ever touches real font metrics.
 */
export function createCanvasMeasurer(fontFamily: string): TextMeasurer {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable — createCanvasMeasurer must run inside a real browser render context");

  return {
    measureWidth(text: string, fontSizePx: number): number {
      ctx.font = `${fontSizePx}px ${fontFamily}`;
      return ctx.measureText(text).width;
    },
    lineHeightPx(fontSizePx: number): number {
      // A real font's line-height metrics come from its own line-gap/ascent/descent, which
      // measureText's TextMetrics doesn't expose in every browser — 1.3x is a standard,
      // documented approximation used until FontMetrics/actualBoundingBox* support is
      // universal enough to rely on for this codebase's target render environment.
      return fontSizePx * 1.3;
    },
  };
}
