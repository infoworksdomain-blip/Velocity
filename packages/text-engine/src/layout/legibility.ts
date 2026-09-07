/**
 * Build script 8B.5: "Sample mean luminance of the underlying frame inside
 * the overlay's bounding box at the overlay's start frame and midpoint.
 * Below threshold -> light text with dark stroke; above -> dark text on a
 * light plate. Minimum contrast ratio 4.5:1 measured, not assumed."
 *
 * Operates on a plain RGBA pixel buffer (the shape any frame source —
 * canvas ImageData, a decoded video frame, a rendered still — reduces to),
 * not a DOM ImageData object, so it's testable with synthetic buffers with
 * no browser/canvas runtime required.
 */
export interface PixelBox {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major — exactly ImageData.data's layout. */
  data: Uint8ClampedArray;
}

/** Relative luminance per WCAG 2.x (sRGB -> linear -> weighted sum), the same formula the 4.5:1 contrast ratio below is defined against. */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function meanLuminance(box: PixelBox): number {
  const pixelCount = box.width * box.height;
  if (pixelCount === 0) throw new Error("meanLuminance requires a non-empty box");
  let sum = 0;
  for (let i = 0; i < box.data.length; i += 4) {
    sum += relativeLuminance(box.data[i]!, box.data[i + 1]!, box.data[i + 2]!);
  }
  return sum / pixelCount;
}

/** WCAG 2.x contrast ratio between two relative luminances — always >= 1, symmetric in its inputs. */
export function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

export const MIN_CONTRAST_RATIO = 4.5;

export type TextTreatment = "light_text_dark_stroke" | "dark_text_light_plate";

const LUMINANCE_OF_WHITE = 1;
const LUMINANCE_OF_BLACK = 0;
/** Threshold below which the frame reads as "dark" — this is the midpoint luminance where light-on-dark and dark-on-light give equal contrast, not an arbitrary guess. */
const LUMINANCE_THRESHOLD = 0.18;

/**
 * Picks a treatment from the sampled frame luminance, then verifies the
 * chosen treatment actually clears MIN_CONTRAST_RATIO against that same
 * sampled luminance — "measured, not assumed" per the spec. Both frame
 * luminance samples (start frame and midpoint, per the spec) are checked;
 * the caller passes whichever is currently relevant, or the worse
 * (lower-contrast) of the two if it wants a single, more conservative call
 * for a whole overlay's on-screen duration.
 */
export function chooseTextTreatment(frameLuminance: number): { treatment: TextTreatment; contrastRatioAchieved: number; meetsMinimum: boolean } {
  const treatment: TextTreatment = frameLuminance < LUMINANCE_THRESHOLD ? "light_text_dark_stroke" : "dark_text_light_plate";
  const textLuminance = treatment === "light_text_dark_stroke" ? LUMINANCE_OF_WHITE : LUMINANCE_OF_BLACK;
  const contrastRatioAchieved = contrastRatio(frameLuminance, textLuminance);
  return { treatment, contrastRatioAchieved, meetsMinimum: contrastRatioAchieved >= MIN_CONTRAST_RATIO };
}
