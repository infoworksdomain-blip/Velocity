/**
 * Consent gating (STEP 15 hard requirement: "no likeness of a real
 * identifiable person without a recorded, verifiable consent artefact
 * ... generation blocked without it"). Pure logic over already-fetched
 * rows — the same "logic separate from I/O" shape used throughout this
 * codebase — so the DB-fetching activity/service stays a thin wrapper.
 */

export interface PersonaConsentInput {
  modelsRealPerson: boolean;
  consentArtefactId: string | null;
}

export interface ConsentArtefactRecord {
  id: string;
  expiresAt: Date | null;
}

export interface ConsentCheckResult {
  allowed: boolean;
  reason: string | null;
}

/**
 * `now` is injectable for real, deterministic expiry testing (the same
 * pattern STEP 11's token-refresh daemon uses) — an expired consent
 * artefact is treated exactly like a missing one: generation blocked,
 * not silently allowed on a technicality.
 */
export function checkPersonaConsent(persona: PersonaConsentInput, artefact: ConsentArtefactRecord | null, now: Date = new Date()): ConsentCheckResult {
  if (!persona.modelsRealPerson) {
    return { allowed: true, reason: null };
  }
  if (!persona.consentArtefactId || !artefact) {
    return { allowed: false, reason: "This persona models a real identifiable person and has no consent artefact on file." };
  }
  if (artefact.expiresAt && artefact.expiresAt.getTime() <= now.getTime()) {
    return { allowed: false, reason: `The consent artefact for this persona expired on ${artefact.expiresAt.toISOString()}.` };
  }
  return { allowed: true, reason: null };
}
