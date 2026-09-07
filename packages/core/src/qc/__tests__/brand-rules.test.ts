import { describe, expect, it } from "vitest";
import { checkBrandRules, type BrandRulesRow } from "../brand-rules.js";

const RULES: BrandRulesRow = {
  bannedWords: ["cheap"],
  bannedClaims: ["#1 best in the world"],
  requiredDisclaimers: ["Results may vary"],
};

describe("checkBrandRules", () => {
  it("returns no violations when rules is null (no brand rules configured yet)", () => {
    expect(checkBrandRules("Anything goes here.", null)).toEqual([]);
  });

  it("flags a banned word", () => {
    const violations = checkBrandRules("Our cheap prices beat everyone.", RULES);
    expect(violations).toContainEqual({ kind: "banned_word", detail: "cheap" });
  });

  it("flags a banned claim", () => {
    const violations = checkBrandRules("We are the #1 best in the world.", RULES);
    expect(violations).toContainEqual({ kind: "banned_claim", detail: "#1 best in the world" });
  });

  it("flags a missing required disclaimer", () => {
    const violations = checkBrandRules("Buy now and save.", RULES);
    expect(violations).toContainEqual({ kind: "missing_disclaimer", detail: "Results may vary" });
  });

  it("passes clean, compliant text with no violations", () => {
    const violations = checkBrandRules("Buy now and save. Results may vary.", RULES);
    expect(violations).toEqual([]);
  });

  it("is case-insensitive for banned words and claims", () => {
    const violations = checkBrandRules("CHEAP prices!", RULES);
    expect(violations.some((v) => v.kind === "banned_word")).toBe(true);
  });
});
