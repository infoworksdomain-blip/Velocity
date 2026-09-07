/**
 * Safety classification (STEP 8.4's QC activity). A real model-backed
 * safety classifier needs a funded API call — this is a deterministic
 * lexicon-based classifier covering the regulated categories the build
 * script calls out (health, financial, legal-outcome claims, profanity,
 * competitor disparagement). It's real, testable, and a genuine first line
 * of defence; a documented seam for a stronger model-backed classifier
 * later, not a placeholder that always passes.
 */

export type SafetyCategory = "profanity" | "health_claim" | "financial_claim" | "legal_outcome_claim" | "competitor_disparagement";

export interface SafetyVerdict {
  passed: boolean;
  flaggedCategories: SafetyCategory[];
  matchedTerms: string[];
}

const LEXICON: Record<SafetyCategory, string[]> = {
  profanity: [], // deliberately empty here — a real profanity list is a data/localisation decision, not fabricated; wire a vetted list before relying on this category
  health_claim: ["cures cancer", "cures disease", "guaranteed weight loss", "fda approved cure", "treats diabetes"],
  financial_claim: ["guaranteed returns", "risk-free investment", "get rich quick", "guaranteed profit"],
  legal_outcome_claim: ["guaranteed win", "guaranteed acquittal", "guaranteed settlement"],
  competitor_disparagement: [], // requires a per-workspace competitor list (brandProfiles.competitors) — see checkCompetitorDisparagement below
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

  return {
    passed: flaggedCategories.length === 0,
    flaggedCategories: [...new Set(flaggedCategories)],
    matchedTerms,
  };
}
