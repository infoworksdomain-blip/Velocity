import type { QcReport } from "@velocity/contracts";
import type { BrandRuleViolation } from "./brand-rules.js";
import type { MediaCheckResult } from "./media-checks.js";
import type { SafetyVerdict } from "./safety.js";

export * from "./brand-rules.js";
export * from "./media-checks.js";
export * from "./phash.js";
export * from "./safety.js";

export interface RunQcInput {
  safety: SafetyVerdict;
  brandRuleViolations: BrandRuleViolation[];
  isNearDuplicate: boolean;
  durationAspect: MediaCheckResult;
  audioPresence: MediaCheckResult;
}

/**
 * Aggregates every individual QC check into one verdict (STEP 8.4).
 * "Failures route to regeneration, not to the user" (build script line
 * 275) is why this never throws — it always returns a report the workflow
 * can act on (retry vs. fail closed), which is the caller's job.
 */
export function runQc(input: RunQcInput): QcReport {
  const notes: string[] = [];

  if (!input.safety.passed) {
    notes.push(`safety: flagged categories [${input.safety.flaggedCategories.join(", ")}]`);
  }
  for (const violation of input.brandRuleViolations) {
    notes.push(`brand rule violation (${violation.kind}): ${violation.detail}`);
  }
  if (input.isNearDuplicate) {
    notes.push("near-duplicate of an existing workspace render");
  }
  notes.push(...input.durationAspect.reasons);
  notes.push(...input.audioPresence.reasons);

  const bannedClaimsPassed = !input.brandRuleViolations.some((v) => v.kind === "banned_claim" || v.kind === "banned_word");
  const allPassed =
    input.safety.passed &&
    bannedClaimsPassed &&
    !input.isNearDuplicate &&
    input.durationAspect.passed &&
    input.audioPresence.passed;

  // Safety failures and near-duplicates are worth a regeneration attempt
  // (a different generation might clear the bar); brand-rule and media
  // spec violations are deterministic — regenerating with the same prompt
  // produces the same violation, so those fail closed instead of looping.
  const verdict = allPassed ? "pass" : !input.safety.passed || input.isNearDuplicate ? "regenerate" : "fail";

  return {
    verdict,
    notes,
    safetyPassed: input.safety.passed,
    bannedClaimsPassed,
    duplicateCheckPassed: !input.isNearDuplicate,
    durationAspectPassed: input.durationAspect.passed,
    audioPresencePassed: input.audioPresence.passed,
  };
}
