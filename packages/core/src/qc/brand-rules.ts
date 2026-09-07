/**
 * Reads the real `brand_rules` table (packages/db/src/schema/brand.ts) —
 * banned words, banned claims, required disclaimers set by the customer.
 * This is a real, DB-backed check (STEP 6's brandRules row), not a stub.
 */

export interface BrandRulesRow {
  bannedWords: string[];
  bannedClaims: string[];
  requiredDisclaimers: string[];
}

export type BrandRuleViolationKind = "banned_word" | "banned_claim" | "missing_disclaimer";

export interface BrandRuleViolation {
  kind: BrandRuleViolationKind;
  detail: string;
}

function containsCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function checkBrandRules(text: string, rules: BrandRulesRow | null): BrandRuleViolation[] {
  if (!rules) return [];
  const violations: BrandRuleViolation[] = [];

  for (const word of rules.bannedWords) {
    if (containsCaseInsensitive(text, word)) {
      violations.push({ kind: "banned_word", detail: word });
    }
  }
  for (const claim of rules.bannedClaims) {
    if (containsCaseInsensitive(text, claim)) {
      violations.push({ kind: "banned_claim", detail: claim });
    }
  }
  for (const disclaimer of rules.requiredDisclaimers) {
    if (!containsCaseInsensitive(text, disclaimer)) {
      violations.push({ kind: "missing_disclaimer", detail: disclaimer });
    }
  }

  return violations;
}
