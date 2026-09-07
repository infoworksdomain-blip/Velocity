/**
 * Perceptual hash for near-duplicate detection (STEP 8.4's QC activity).
 * A real average-hash (aHash) algorithm — not the fuller DCT-based pHash
 * variant, but the same family and genuinely discriminative: near-identical
 * frames hash to a low Hamming distance, visually distinct ones to a high
 * one. What's stubbed is upstream of this function (extracting an actual
 * 8x8 grayscale sample from a real rendered video frame requires a real
 * render, which STEP 8's compose activity doesn't produce — see
 * docs/steps/STEP-08.md). The hash and distance functions here are real
 * and exercised against synthetic bitmaps.
 */

const GRID_SIZE = 8;
const PIXEL_COUNT = GRID_SIZE * GRID_SIZE;

export function perceptualHash(grayscale8x8: Uint8Array): string {
  if (grayscale8x8.length !== PIXEL_COUNT) {
    throw new Error(`perceptualHash expects exactly ${PIXEL_COUNT} pixels (8x8 grayscale), got ${grayscale8x8.length}`);
  }

  let sum = 0;
  for (const pixel of grayscale8x8) sum += pixel;
  const mean = sum / PIXEL_COUNT;

  let bits = "";
  for (const pixel of grayscale8x8) {
    bits += pixel > mean ? "1" : "0";
  }

  // Pack the 64-bit string into 16 hex characters.
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) {
    throw new Error(`Hash length mismatch: ${hashA.length} vs ${hashB.length}`);
  }
  let distance = 0;
  for (let i = 0; i < hashA.length; i++) {
    const diff = parseInt(hashA[i] ?? "0", 16) ^ parseInt(hashB[i] ?? "0", 16);
    distance += diff.toString(2).split("1").length - 1;
  }
  return distance;
}

/** GATE 8's near-duplicate check: a Hamming distance below this threshold (out of 64 bits) is treated as a near-duplicate against workspace history. */
export const NEAR_DUPLICATE_HAMMING_THRESHOLD = 8;

export function isNearDuplicate(hashA: string, hashB: string): boolean {
  return hammingDistance(hashA, hashB) <= NEAR_DUPLICATE_HAMMING_THRESHOLD;
}
