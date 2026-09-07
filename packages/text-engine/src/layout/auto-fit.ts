import { breakIntoLines } from "./line-break.js";

/**
 * A real text measurement function's shape (build script 8B.5: "Measure
 * with canvas measureText against the loaded font at render time"). The
 * production implementation is a thin wrapper around the browser Canvas
 * API's `measureText`, run inside Remotion's actual render context (Studio
 * or a headless-Chromium Lambda render) — a real browser, which this
 * Node-only sandbox does not have (same category of gap as the missing
 * ffmpeg binary: unrunnable here, not fabricated). `binarySearchFontSize`
 * below is the part that's independent of *which* measurer is used, so it
 * is fully real and fully tested here with a deterministic synthetic
 * measurer standing in for the real canvas call — see
 * __tests__/auto-fit.test.ts's honesty note.
 */
export interface TextMeasurer {
  measureWidth(text: string, fontSizePx: number): number;
  lineHeightPx(fontSizePx: number): number;
}

export interface AutoFitConstraints {
  text: string;
  maxLines: number;
  boxWidthPx: number;
  boxHeightPx: number;
  minFontSizePx: number;
  maxFontSizePx: number;
}

export interface AutoFitResult {
  fontSizePx: number;
  lines: string[];
}

function tryFit(words: string[], fontSizePx: number, measurer: TextMeasurer, constraints: AutoFitConstraints): string[] | null {
  const lines = breakIntoLines(words, constraints.boxWidthPx, constraints.maxLines, (text) => measurer.measureWidth(text, fontSizePx));
  if (!lines) return null;
  const totalHeight = lines.length * measurer.lineHeightPx(fontSizePx);
  if (totalHeight > constraints.boxHeightPx) return null;
  // breakIntoLines lets its LAST allowed line take every remaining word
  // regardless of width (by design — see its own doc comment), so this
  // fontSizePx has not actually been proven to fit until every line,
  // including that last one, is re-checked against the box width here.
  // Without this, the binary search could accept a size where only the
  // final line silently overflows — exactly the "no overlay falls outside
  // the safe box" property GATE 8B is meant to guarantee.
  if (lines.some((line) => measurer.measureWidth(line, fontSizePx) > constraints.boxWidthPx)) return null;
  return lines;
}

/**
 * "Never let the model choose the font size — it will be wrong; the model
 * chooses the words, the renderer chooses the size." Binary search between
 * `minFontSizePx` and `maxFontSizePx` (a style preset's declared range) for
 * the largest size whose line-broken text still fits `maxLines` within the
 * box. Deterministic and total: always returns a result, falling back to
 * `minFontSizePx` (with whatever line break it produces, even if it
 * overflows) rather than throwing — GATE 8B's "no overlay falls outside the
 * safe box" claim is enforced by the CALLER checking this result's fit and
 * escalating to a per-platform variant when even the minimum doesn't fit,
 * not by this function silently pretending success.
 */
export function binarySearchFontSize(constraints: AutoFitConstraints, measurer: TextMeasurer): AutoFitResult {
  const words = constraints.text.split(/\s+/).filter(Boolean);

  let lo = constraints.minFontSizePx;
  let hi = constraints.maxFontSizePx;
  let best: AutoFitResult = { fontSizePx: lo, lines: tryFit(words, lo, measurer, constraints) ?? [constraints.text] };

  // Integer binary search over font size in px — fine-grained enough for any real style preset range, and avoids infinite bisection on a continuous domain.
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const lines = tryFit(words, mid, measurer, constraints);
    if (lines) {
      best = { fontSizePx: mid, lines };
      lo = mid + 1; // it fits at `mid` — try to go bigger
    } else {
      hi = mid - 1; // too big at `mid` — go smaller
    }
  }

  return best;
}

/** True when the result actually respects the constraints, i.e. binarySearchFontSize found a genuine fit rather than falling back to its "even the minimum overflows" case. */
export function fitsWithinBox(result: AutoFitResult, constraints: AutoFitConstraints, measurer: TextMeasurer): boolean {
  if (result.lines.length > constraints.maxLines) return false;
  const totalHeight = result.lines.length * measurer.lineHeightPx(result.fontSizePx);
  if (totalHeight > constraints.boxHeightPx) return false;
  return result.lines.every((line) => measurer.measureWidth(line, result.fontSizePx) <= constraints.boxWidthPx);
}
