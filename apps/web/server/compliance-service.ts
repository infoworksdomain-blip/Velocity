import { audit, compliance } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq, or } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";

/**
 * STEP 20's real GDPR/UK-GDPR DSAR export + erasure mechanism (see
 * packages/core/src/compliance/dsar.ts for the scope/legal-basis
 * reasoning). Platform-root tables only (ADR 0003) — the account/
 * identity layer, not a cross-workspace sweep of every row a user's
 * membership could theoretically touch.
 */
export type ComplianceDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DsarExport {
  user: { id: string; email: string; name: string | null; createdAt: Date } | null;
  sessions: Array<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: Date; lastUsedAt: Date; revokedAt: Date | null }>;
  mfaCredentials: Array<{ id: string; enabledAt: Date | null; createdAt: Date }>; // never the encrypted secret itself
  memberships: Array<{ id: string; workspaceId: string; roleId: string; createdAt: Date }>;
  auditLogsAsActor: Array<{ id: string; action: string; targetType: string; targetId: string; createdAt: Date }>;
  impersonationSessions: Array<{ id: string; actorUserId: string; targetUserId: string; reason: string; startedAt: Date; endedAt: Date | null }>;
}

export async function exportUserData(userId: string, db: ComplianceDb = getAdminDb()): Promise<DsarExport> {
  const [userRows, sessionRows, mfaRows, membershipRows, auditRows, impersonationRows] = await Promise.all([
    db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, createdAt: schema.users.createdAt }).from(schema.users).where(eq(schema.users.id, userId)).limit(1),
    db.select({ id: schema.sessions.id, userAgent: schema.sessions.userAgent, ipAddress: schema.sessions.ipAddress, createdAt: schema.sessions.createdAt, lastUsedAt: schema.sessions.lastUsedAt, revokedAt: schema.sessions.revokedAt }).from(schema.sessions).where(eq(schema.sessions.userId, userId)),
    db.select({ id: schema.mfaCredentials.id, enabledAt: schema.mfaCredentials.enabledAt, createdAt: schema.mfaCredentials.createdAt }).from(schema.mfaCredentials).where(eq(schema.mfaCredentials.userId, userId)),
    db.select({ id: schema.memberships.id, workspaceId: schema.memberships.workspaceId, roleId: schema.memberships.roleId, createdAt: schema.memberships.createdAt }).from(schema.memberships).where(eq(schema.memberships.userId, userId)),
    db.select({ id: schema.auditLogs.id, action: schema.auditLogs.action, targetType: schema.auditLogs.targetType, targetId: schema.auditLogs.targetId, createdAt: schema.auditLogs.createdAt }).from(schema.auditLogs).where(eq(schema.auditLogs.actorUserId, userId)),
    db
      .select({ id: schema.impersonationSessions.id, actorUserId: schema.impersonationSessions.actorUserId, targetUserId: schema.impersonationSessions.targetUserId, reason: schema.impersonationSessions.reason, startedAt: schema.impersonationSessions.startedAt, endedAt: schema.impersonationSessions.endedAt })
      .from(schema.impersonationSessions)
      .where(or(eq(schema.impersonationSessions.actorUserId, userId), eq(schema.impersonationSessions.targetUserId, userId))),
  ]);

  return {
    user: userRows[0] ?? null,
    sessions: sessionRows,
    mfaCredentials: mfaRows,
    memberships: membershipRows,
    auditLogsAsActor: auditRows,
    impersonationSessions: impersonationRows,
  };
}

export interface EraseUserDataInput {
  targetUserId: string;
  actorUserId: string;
}

/** Real erasure: hard-deletes sessions/MFA credentials (nothing legally required to retain), anonymizes the users row itself (the actual PII), and leaves audit_logs/impersonation_sessions rows intact — see dsar.ts's own doc comment on why (GDPR Art. 17(3)'s legal-obligation/legal-claims retention exception). Writes its own permanent audit_logs entry, the same "every destructive admin action is audited" discipline STEP 18 established. */
export async function eraseUserData(input: EraseUserDataInput, db: ComplianceDb = getAdminDb()): Promise<void> {
  const anonymized = compliance.anonymizeUserFields(input.targetUserId);

  await db.update(schema.users).set(anonymized).where(eq(schema.users.id, input.targetUserId));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, input.targetUserId));
  await db.delete(schema.mfaCredentials).where(eq(schema.mfaCredentials.userId, input.targetUserId));
  await db.delete(schema.mfaRecoveryCodes).where(eq(schema.mfaRecoveryCodes.userId, input.targetUserId));

  await audit.writeAuditLog(db, {
    workspaceId: null,
    actorUserId: input.actorUserId,
    action: "gdpr.erasure_completed",
    targetType: "user",
    targetId: input.targetUserId,
    before: null,
    after: { anonymizedEmail: anonymized.email },
  });
}
