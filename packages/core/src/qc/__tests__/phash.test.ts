import { describe, expect, it } from "vitest";
import { hammingDistance, isNearDuplicate, perceptualHash } from "../phash.js";

function solidGrid(value: number): Uint8Array {
  return new Uint8Array(64).fill(value);
}

function checkerboardGrid(): Uint8Array {
  const grid = new Uint8Array(64);
  for (let i = 0; i < 64; i++) grid[i] = i % 2 === 0 ? 0 : 255;
  return grid;
}

describe("perceptualHash", () => {
  it("throws for a non-64-pixel input", () => {
    expect(() => perceptualHash(new Uint8Array(10))).toThrow();
  });

  it("is deterministic for identical input", () => {
    const grid = checkerboardGrid();
    expect(perceptualHash(grid)).toBe(perceptualHash(grid));
  });

  it("produces a 16-character hex string (64 bits)", () => {
    expect(perceptualHash(checkerboardGrid())).toMatch(/^[0-9a-f]{16}$/);
  });

  it("a solid image hashes to all-zero bits — no pixel exceeds the mean", () => {
    expect(perceptualHash(solidGrid(128))).toBe("0000000000000000");
  });
});

describe("hammingDistance", () => {
  it("is 0 for identical hashes", () => {
    const hash = perceptualHash(checkerboardGrid());
    expect(hammingDistance(hash, hash)).toBe(0);
  });

  it("is 64 for maximally different hashes", () => {
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("throws on mismatched hash lengths", () => {
    expect(() => hammingDistance("00", "0000")).toThrow();
  });
});

describe("isNearDuplicate — the real algorithm behind GATE 8's pHash check", () => {
  it("flags near-identical images as duplicates", () => {
    const grid = checkerboardGrid();
    const almostIdentical = new Uint8Array(grid);
    almostIdentical[0] = almostIdentical[0] === 0 ? 10 : 245; // one pixel nudged slightly, same side of the mean
    expect(isNearDuplicate(perceptualHash(grid), perceptualHash(almostIdentical))).toBe(true);
  });

  it("does not flag visually distinct images as duplicates", () => {
    const a = solidGrid(0);
    const b = checkerboardGrid();
    expect(isNearDuplicate(perceptualHash(a), perceptualHash(b))).toBe(false);
  });
});
