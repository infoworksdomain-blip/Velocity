import { binarySearchFontSize, chooseTextTreatment, type BoundingBox, type TextMeasurer } from "@velocity/text-engine";
import { createCanvasMeasurer } from "./canvas-measurer.js";

export interface OverlayLayoutInput {
  text: string;
  maxLines: number;
  box: BoundingBox;
  minFontSizePx: number;
  maxFontSizePx: number;
  fontFamily: string;
  /** Sampled 0-1 mean luminance of the frame under this overlay at its start/mid frame — see legibility.ts. Passed in rather than computed here: sampling actual pixels is the caller's job (it has the frame), this hook only decides layout + treatment from the result. */
  frameLuminance: number;
}

export interface OverlayLayout {
  fontSizePx: number;
  lines: string[];
  treatment: ReturnType<typeof chooseTextTreatment>["treatment"];
  contrastRatioAchieved: number;
}

let cachedMeasurer: { fontFamily: string; measurer: TextMeasurer } | null = null;

function getMeasurer(fontFamily: string): TextMeasurer {
  if (cachedMeasurer?.fontFamily === fontFamily) return cachedMeasurer.measurer;
  const measurer = createCanvasMeasurer(fontFamily);
  cachedMeasurer = { fontFamily, measurer };
  return measurer;
}

/**
 * The real, render-time computation build script 8B.5 describes: auto-fit
 * font size via binary search against real canvas metrics, then a
 * measured (not assumed) legibility treatment. "Never let the model choose
 * the font size — the renderer chooses the size" — this is that renderer,
 * running once per overlay per frame it's evaluated on (Remotion
 * memoizes/recomputes per frame render, not per video, which is correct
 * here since `frameLuminance` genuinely varies across an overlay's
 * on-screen duration).
 */
export function useOverlayLayout(input: OverlayLayoutInput): OverlayLayout {
  const measurer = getMeasurer(input.fontFamily);
  const { fontSizePx, lines } = binarySearchFontSize(
    {
      text: input.text,
      maxLines: input.maxLines,
      boxWidthPx: input.box.right - input.box.left,
      boxHeightPx: input.box.bottom - input.box.top,
      minFontSizePx: input.minFontSizePx,
      maxFontSizePx: input.maxFontSizePx,
    },
    measurer,
  );
  const { treatment, contrastRatioAchieved } = chooseTextTreatment(input.frameLuminance);
  return { fontSizePx, lines, treatment, contrastRatioAchieved };
}
