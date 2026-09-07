import { describe, expect, it } from "vitest";
import { classifySafety } from "../safety.js";

describe("classifySafety", () => {
  it("passes clean text", () => {
    const verdict = classifySafety("Try our new productivity app today!");
    expect(verdict.passed).toBe(true);
    expect(verdict.flaggedCategories).toEqual([]);
  });

  it("flags a health claim", () => {
    const verdict = classifySafety("This supplement cures cancer in weeks.");
    expect(verdict.passed).toBe(false);
    expect(verdict.flaggedCategories).toContain("health_claim");
  });

  it("flags a financial claim", () => {
    const verdict = classifySafety("Invest today for guaranteed returns.");
    expect(verdict.passed).toBe(false);
    expect(verdict.flaggedCategories).toContain("financial_claim");
  });

  it("flags a legal outcome claim", () => {
    const verdict = classifySafety("We offer a guaranteed win in your case.");
    expect(verdict.flaggedCategories).toContain("legal_outcome_claim");
  });

  it("is case-insensitive", () => {
    const verdict = classifySafety("GUARANTEED RETURNS on every trade");
    expect(verdict.passed).toBe(false);
  });

  it("flags competitor disparagement when a competitor list is given", () => {
    const verdict = classifySafety("Unlike the trash from Acme, ours actually works.", ["Acme"]);
    expect(verdict.flaggedCategories).toContain("competitor_disparagement");
  });

  it("does not flag competitor mentions that aren't disparaging", () => {
    const verdict = classifySafety("Compare us to Acme and see the difference.", ["Acme"]);
    expect(verdict.passed).toBe(true);
  });

  it("deduplicates repeated category flags", () => {
    const verdict = classifySafety("Guaranteed returns and also guaranteed profit for everyone.");
    expect(verdict.flaggedCategories).toEqual(["financial_claim"]);
  });
});
