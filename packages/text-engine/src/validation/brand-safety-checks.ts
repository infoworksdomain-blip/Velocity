/**
 * Local copies of @velocity/core's real `checkBrandRules`/`classifySafety`
 * (packages/core/src/qc/{brand-rules,safety}.ts), not imported from there:
 * @velocity/providers now depends on @velocity/text-engine for the
 * router-compatible TextProvider type (STEP 8B), and @velocity/core
 * already depends on @velocity/providers — importing @velocity/core here
 * too would complete a circular dependency (providers -> text-engine ->
 * core -> providers), which turbo's build graph correctly refuses to
 * build. These two checks are small, pure, and logic-identical to core's;
 * duplicating them here is the same trade-off already made for
 * `cosineSimilarity` in repair-loop.ts, for the same reason.
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
    if (containsCaseInsensitive(text, word)) violations.push({ kind: "banned_word", detail: word });
  }
  for (const claim of rules.bannedClaims) {
    if (containsCaseInsensitive(text, claim)) violations.push({ kind: "banned_claim", detail: claim });
  }
  for (const disclaimer of rules.requiredDisclaimers) {
    if (!containsCaseInsensitive(text, disclaimer)) violations.push({ kind: "missing_disclaimer", detail: disclaimer });
  }

  return violations;
}

export type SafetyCategory = "profanity" | "health_claim" | "financial_claim" | "legal_outcome_claim" | "competitor_disparagement";

export interface SafetyVerdict {
  passed: boolean;
  flaggedCategories: SafetyCategory[];
  matchedTerms: string[];
}

const LEXICON: Record<SafetyCategory, string[]> = {
  profanity: [],
  health_claim: ["cures cancer", "cures disease", "guaranteed weight loss", "fda approved cure", "treats diabetes"],
  financial_claim: ["guaranteed returns", "risk-free investment", "get rich quick", "guaranteed profit"],
  legal_outcome_claim: ["guaranteed win", "guaranteed acquittal", "guaranteed settlement"],
  competitor_disparagement: [],
};

function containsPhrase(haystack: string, phrase: string): boolean {
  return haystack.toLowerCase().includes(phrase.toLowerCase());
}

export function classifySafety(text: string, competitors: string[] = []): SafetyVerdict {
  const flaggedCategories: SafetyCategory[] = [];
  const matchedTerms: string[] = [];

  for (const [category, terms] of Object.entries(LEXICON) as [SafetyCategory, string[]][]) {
    for (const term of terms) {
      if (containsPhrase(text, term)) {
        flaggedCategories.push(category);
        matchedTerms.push(term);
      }
    }
  }

  for (const competitor of competitors) {
    const disparaging = [`${competitor} is bad`, `${competitor} is a scam`, `unlike the trash from ${competitor}`];
    for (const phrase of disparaging) {
      if (containsPhrase(text, phrase)) {
        flaggedCategories.push("competitor_disparagement");
        matchedTerms.push(phrase);
      }
    }
  }

  return { passed: flaggedCategories.length === 0, flaggedCategories: [...new Set(flaggedCategories)], matchedTerms };
}
