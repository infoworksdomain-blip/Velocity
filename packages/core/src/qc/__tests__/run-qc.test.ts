import { describe, expect, it } from "vitest";
import { runQc, type RunQcInput } from "../index.js";

const PASSING_INPUT: RunQcInput = {
  safety: { passed: true, flaggedCategories: [], matchedTerms: [] },
  brandRuleViolations: [],
  isNearDuplicate: false,
  durationAspect: { passed: true, reasons: [] },
  audioPresence: { passed: true, reasons: [] },
};

describe("runQc — aggregates every check into one verdict (never surfaces to the user, STEP 8.4)", () => {
  it("verdict is pass when every check passes", () => {
    const report = runQc(structuredClone(PASSING_INPUT));
    expect(report.verdict).toBe("pass");
    expect(report.notes).toEqual([]);
  });

  it("a safety failure routes to regenerate — a different generation might clear the bar", () => {
    const report = runQc({
      ...structuredClone(PASSING_INPUT),
      safety: { passed: false, flaggedCategories: ["health_claim"], matchedTerms: ["cures cancer"] },
    });
    expect(report.verdict).toBe("regenerate");
    expect(report.safetyPassed).toBe(false);
  });

  it("a near-duplicate routes to regenerate", () => {
    const report = runQc({ ...structuredClone(PASSING_INPUT), isNearDuplicate: true });
    expect(report.verdict).toBe("regenerate");
    expect(report.duplicateCheckPassed).toBe(false);
  });

  it("a brand-rule violation fails closed — regenerating the same prompt reproduces the same violation", () => {
    const report = runQc({
      ...structuredClone(PASSING_INPUT),
      brandRuleViolations: [{ kind: "banned_word", detail: "cheap" }],
    });
    expect(report.verdict).toBe("fail");
    expect(report.bannedClaimsPassed).toBe(false);
  });

  it("a duration/aspect failure fails closed (deterministic, not worth retrying)", () => {
    const report = runQc({
      ...structuredClone(PASSING_INPUT),
      durationAspect: { passed: false, reasons: ["duration too short"] },
    });
    expect(report.verdict).toBe("fail");
    expect(report.notes).toContain("duration too short");
  });

  it("collects notes from every failing check, not just the first", () => {
    const report = runQc({
      safety: { passed: false, flaggedCategories: ["health_claim"], matchedTerms: ["cures cancer"] },
      brandRuleViolations: [{ kind: "missing_disclaimer", detail: "Results may vary" }],
      isNearDuplicate: false,
      durationAspect: { passed: false, reasons: ["duration too short"] },
      audioPresence: { passed: false, reasons: ["audio track required but not present"] },
    });
    expect(report.notes.length).toBeGreaterThanOrEqual(4);
  });
});
