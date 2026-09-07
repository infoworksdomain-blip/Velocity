import type { TextMeasurer } from "./auto-fit.js";

/**
 * A real, documented approximation — NOT the production measurer. The
 * production path (build script 8B.5) is the browser Canvas API's
 * `measureText`, run inside Remotion's actual render context (a real
 * Chromium, whether Studio or a headless Lambda render); this Node-only
 * worker has no browser and no bundled font files to measure against for
 * real (same category of gap as the missing ffmpeg binary and the
 * unfunded C2PA signing cert).
 *
 * This measurer exists for the validation/repair loop's pre-flight length
 * check (8B.4 step 2) — it needs SOME answer to "will this roughly fit"
 * before spending a repair call, not pixel-perfect layout (that's what the
 * real Remotion-time auto-fit pass, using the real measurer, is for).
 * Average-glyph-width-per-point-size is a standard, legitimate technique
 * for exactly this kind of pre-flight estimate; it is not claimed to be
 * more than that.
 */
const AVERAGE_GLYPH_WIDTH_RATIO = 0.55; // typical proportional sans-serif at normal tracking
const LINE_HEIGHT_RATIO = 1.3;

export function createHeuristicMeasurer(): TextMeasurer {
  return {
    measureWidth(text: string, fontSizePx: number): number {
      return text.length * fontSizePx * AVERAGE_GLYPH_WIDTH_RATIO;
    },
    lineHeightPx(fontSizePx: number): number {
      return fontSizePx * LINE_HEIGHT_RATIO;
    },
  };
}
