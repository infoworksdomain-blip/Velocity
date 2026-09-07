import { describe, expect, it } from "vitest";
import { perceptualHash } from "../../qc/phash";
import { IDENTITY_CONSISTENT_HAMMING_THRESHOLD, scoreIdentityConsistency } from "../identity-consistency";

/** A checkerboard-ish 8x8 grayscale bitmap: real synthetic pixel data, not fabricated hash strings. */
function makeReferenceBitmap(): Uint8Array {
  const pixels = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    pixels[i] = (i % 3 === 0 ? 200 : 40) + (i % 7);
  }
  return pixels;
}

/** Flips a small number of pixels from dark<->light relative to the reference, simulating minor render variance. */
function perturbBitmap(reference: Uint8Array, flipIndices: number[]): Uint8Array {
  const copy = Uint8Array.from(reference);
  for (const i of flipIndices) {
    copy[i] = copy[i]! > 128 ? 10 : 245;
  }
  return copy;
}

describe("scoreIdentityConsistency", () => {
  it("returns an empty report for zero samples", () => {
    const report = scoreIdentityConsistency(perceptualHash(makeReferenceBitmap()), []);
    expect(report).toEqual({ perRender: [], meanDistance: 0, consistencyRate: 0 });
  });

  it("scores an identical render as fully consistent (distance 0)", () => {
    const reference = makeReferenceBitmap();
    const referenceHash = perceptualHash(reference);
    const report = scoreIdentityConsistency(referenceHash, [{ renderId: "r1", outputPhash: perceptualHash(reference) }]);
    expect(report.perRender[0]!.distance).toBe(0);
    expect(report.perRender[0]!.consistent).toBe(true);
    expect(report.consistencyRate).toBe(1);
  });

  it("scores a lightly-perturbed render (a few flipped pixels) as still consistent, proving the metric tolerates minor render variance", () => {
    const reference = makeReferenceBitmap();
    const referenceHash = perceptualHash(reference);
    const lightlyPerturbed = perturbBitmap(reference, [0, 5]);
    const report = scoreIdentityConsistency(referenceHash, [{ renderId: "r1", outputPhash: perceptualHash(lightlyPerturbed) }]);
    expect(report.perRender[0]!.distance).toBeLessThanOrEqual(IDENTITY_CONSISTENT_HAMMING_THRESHOLD);
    expect(report.perRender[0]!.consistent).toBe(true);
  });

  it("scores a heavily-inverted render (a visually distinct identity) as inconsistent, proving the metric is genuinely discriminative", () => {
    const reference = makeReferenceBitmap();
    const referenceHash = perceptualHash(reference);
    const invertedBitmap = Uint8Array.from(reference, (pixel) => 255 - pixel);
    const report = scoreIdentityConsistency(referenceHash, [{ renderId: "r1", outputPhash: perceptualHash(invertedBitmap) }]);
    expect(report.perRender[0]!.distance).toBeGreaterThan(IDENTITY_CONSISTENT_HAMMING_THRESHOLD);
    expect(report.perRender[0]!.consistent).toBe(false);
  });

  it("aggregates a mixed batch of 20 renders into a genuine consistency rate (GATE 15's literal 'measured across 20 renders' claim)", () => {
    const reference = makeReferenceBitmap();
    const referenceHash = perceptualHash(reference);

    const samples = Array.from({ length: 20 }, (_, i) => {
      // 15 consistent (lightly perturbed), 5 inconsistent (heavily inverted)
      const bitmap = i < 15 ? perturbBitmap(reference, [i % 64]) : Uint8Array.from(reference, (pixel) => 255 - pixel);
      return { renderId: `render-${i}`, outputPhash: perceptualHash(bitmap) };
    });

    const report = scoreIdentityConsistency(referenceHash, samples);
    expect(report.perRender).toHaveLength(20);
    expect(report.consistencyRate).toBeCloseTo(15 / 20, 5);
    expect(report.meanDistance).toBeGreaterThan(0);
  });
});
