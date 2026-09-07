import { describe, expect, it } from "vitest";
import { generateSlug } from "../short-link";

describe("generateSlug", () => {
  it("returns a 7-character slug by default", () => {
    expect(generateSlug()).toHaveLength(7);
  });

  it("respects a custom length", () => {
    expect(generateSlug(12)).toHaveLength(12);
  });

  it("only uses base62 characters", () => {
    const slug = generateSlug(50);
    expect(/^[0-9a-zA-Z]+$/.test(slug)).toBe(true);
  });

  it("is deterministic given a deterministic random source (for testability)", () => {
    let calls = 0;
    const fixedSource = () => {
      calls++;
      return 0; // always picks alphabet[0]
    };
    expect(generateSlug(5, fixedSource)).toBe("00000");
    expect(calls).toBe(5);
  });
});
