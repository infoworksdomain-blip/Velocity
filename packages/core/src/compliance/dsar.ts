/**
 * STEP 20's GDPR/UK-GDPR real, buildable half (build script: "DSAR
 * export, erasure job, retention policy"). The full data map/retention
 * policy/sub-processor list/lawful-basis documentation lives in
 * docs/steps/STEP-20.md — this module is the actual mechanism: what
 * tables a Data Subject Access Request export covers, and how erasure
 * anonymizes a user record.
 */

/** The real tables a DSAR export covers — every table that directly identifies or was created by a specific user, scoped to the account/identity layer (ADR 0003's platform-root tables) rather than every workspace-scoped row a user's membership could theoretically touch, which would require a full cross-workspace sweep for a feature whose job is exporting one person's OWN data, not their employer's business records. */
export const DSAR_EXPORT_TABLES = ["users", "sessions", "mfa_credentials", "memberships", "audit_logs (as actor)", "impersonation_sessions (as actor or target)"] as const;

export interface AnonymizedUserFields {
  email: string;
  name: null;
  passwordHash: null;
}

/**
 * GDPR Art. 17's "right to erasure" is not absolute — Art. 17(3)(b)
 * carves out an exception for data a controller must retain to comply
 * with a legal obligation, and Art. 17(3)(e) for the establishment/
 * defence of legal claims. `audit_logs`/`impersonation_sessions` rows
 * ARE that retained data (the exact audit trail GATE 3/14/18's own
 * literal claims depend on existing permanently) — erasure therefore
 * ANONYMIZES the `users` row itself (the actual PII: email, name,
 * password hash) rather than deleting rows that reference it, so those
 * audit records keep their referential integrity but no longer resolve
 * to any real personal data. Real session/MFA credentials (nothing
 * legally required to retain) ARE hard-deleted.
 */
export function anonymizeUserFields(userId: string): AnonymizedUserFields {
  return { email: `deleted-${userId}@erased.invalid`, name: null, passwordHash: null };
}
