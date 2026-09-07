import { describe, expect, it } from "vitest";
import { breakIntoLines } from "../line-break.js";

const uniformMeasure = (charWidth: number) => (text: string) => text.length * charWidth;

describe("breakIntoLines", () => {
  it("returns a single line when everything fits", () => {
    const lines = breakIntoLines(["short", "hook", "text"], 1000, 2, uniformMeasure(1));
    expect(lines).toEqual(["short hook text"]);
  });

  it("breaks after a preposition/conjunction over an arbitrary word-count split when both fit", () => {
    // "the plan for" fits at width 14 (12 chars + spaces), and "for" is a break-after word.
    const lines = breakIntoLines(["the", "plan", "for", "growing", "teams"], 14, 2, uniformMeasure(1));
    expect(lines).toEqual(["the plan for", "growing teams"]);
  });

  it("returns null when even one word does not fit at this width", () => {
    const lines = breakIntoLines(["averyveryverylongword"], 5, 2, uniformMeasure(1));
    expect(lines).toBeNull();
  });

  it("the last allowed line takes every remaining word even when width alone couldn't fit them all — the caller (auto-fit's tryFit) is responsible for re-checking that line's actual width", () => {
    const lines = breakIntoLines(["one", "two", "three", "four", "five", "six"], 4, 2, uniformMeasure(1));
    expect(lines).toEqual(["one", "two three four five six"]);
  });

  it("the last allowed line takes everything remaining even if it overflows width", () => {
    const lines = breakIntoLines(["a", "b", "c", "d", "e"], 3, 1, uniformMeasure(1));
    expect(lines).toEqual(["a b c d e"]);
  });

  it("returns an empty array for empty input", () => {
    expect(breakIntoLines([], 1000, 2, uniformMeasure(1))).toEqual([]);
  });
});
