import { classifySafety } from "../qc/safety.js";
import { checkPersonaConsent, type ConsentArtefactRecord, type PersonaConsentInput } from "./consent.js";
import { detectPublicFigureReference, type PublicFiguresConfig } from "./public-figure-check.js";

/**
 * The full persona-generation policy gate (STEP 15) — every hard
 * requirement the build script lists for this step, combined into one
 * real, ordered check: consent first (a hard, never-overridable block),
 * then public-figure detection (also hard, never-overridable — GATE 15's
 * literal "is refused"), then regulated-claim categories (reused as-is
 * from STEP 8's qc/safety.ts — the same lexicon-based classifier, not a
 * second one), which alone is overridable by a real approved
 * moderation_reviews row, matching "unless the workspace has passed
 * manual review."
 */

export interface PersonaPolicyCheckInput {
  persona: PersonaConsentInput;
  consentArtefact: ConsentArtefactRecord | null;
  script: string;
  publicFiguresConfig: PublicFiguresConfig;
  /** A real, already-fetched `moderation_reviews` row for this persona with status 'approved' — resolved by the caller, not by this pure function. */
  hasApprovedManualReview: boolean;
  now?: Date;
}

export type PersonaPolicyBlockReason = "consent_missing" | "public_figure" | "regulated_claim";

export interface PersonaPolicyCheckResult {
  allowed: boolean;
  blockReason: PersonaPolicyBlockReason | null;
  message: string | null;
}

export function checkPersonaGenerationPolicy(input: PersonaPolicyCheckInput): PersonaPolicyCheckResult {
  const consentResult = checkPersonaConsent(input.persona, input.consentArtefact, input.now);
  if (!consentResult.allowed) {
    return { allowed: false, blockReason: "consent_missing", message: consentResult.reason };
  }

  const publicFigureMatch = detectPublicFigureReference(input.script, input.publicFiguresConfig);
  if (publicFigureMatch.matched) {
    return { allowed: false, blockReason: "public_figure", message: `Script references a real named public figure ("${publicFigureMatch.matchedName}") — refused, not reviewable.` };
  }

  const safetyVerdict = classifySafety(input.script);
  if (!safetyVerdict.passed && !input.hasApprovedManualReview) {
    return {
      allowed: false,
      blockReason: "regulated_claim",
      message: `Script flags regulated-claim categories [${safetyVerdict.flaggedCategories.join(", ")}] and this workspace has no approved manual review for this persona.`,
    };
  }

  return { allowed: true, blockReason: null, message: null };
}
