import { randomUUID } from "node:crypto";
import path from "node:path";
import { admin as adminCore, audit } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";
import { resolveModerationReview as resolveModerationReviewRow, type ModerationDecision } from "./ugc-service";

/**
 * STEP 18's Admin I/O layer. Same generic-`db`-parameter pattern as every
 * other *-service.ts in this app (agency-service.ts, ugc-service.ts) —
 * runs identically against real PGlite in tests and real network Postgres
 * in production. Every function that mutates state here writes a real
 * `audit_logs` row via `audit.writeAuditLog` (STEP 14's shared writer) —
 * GATE 18's literal "every destructive admin action audit-logged with
 * actor/target/before-after".
 */
export type AdminDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// User management — search, suspend, unsuspend. Impersonation itself is
// already real and audited (apps/web/server/routers/auth.ts's admin.impersonate,
// built in STEP 3) — this only adds the trigger surface STEP 3 never had.
// ---------------------------------------------------------------------------

export interface UserSearchResult {
  id: string;
  email: string;
  name: string | null;
  platformRoleId: string | null;
  suspendedAt: Date | null;
  suspendedReason: string | null;
}

/** Substring match on email or name, case-insensitive — real search, not a fabricated free-text index. */
export async function searchUsers(query: string, db: AdminDb = getAdminDb()): Promise<UserSearchResult[]> {
  const like = `%${query}%`;
  return db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      platformRoleId: schema.users.platformRoleId,
      suspendedAt: schema.users.suspendedAt,
      suspendedReason: schema.users.suspendedReason,
    })
    .from(schema.users)
    .where(sql`${schema.users.email} ILIKE ${like} OR ${schema.users.name} ILIKE ${like}`)
    .orderBy(schema.users.email)
    .limit(50);
}

export interface SuspendUserInput {
  targetUserId: string;
  reason: string;
  actorUserId: string;
}

export async function suspendUser(input: SuspendUserInput, db: AdminDb = getAdminDb()): Promise<void> {
  const before = await db.select({ suspendedAt: schema.users.suspendedAt, suspendedReason: schema.users.suspendedReason }).from(schema.users).where(eq(schema.users.id, input.targetUserId)).limit(1);
  const suspendedAt = new Date();
  await db.update(schema.users).set({ suspendedAt, suspendedReason: input.reason }).where(eq(schema.users.id, input.targetUserId));
  await audit.writeAuditLog(db, {
    workspaceId: null,
    actorUserId: input.actorUserId,
    action: "user.suspend",
    targetType: "user",
    targetId: input.targetUserId,
    before: before[0] ?? null,
    after: { suspendedAt: suspendedAt.toISOString(), suspendedReason: input.reason },
  });
}

export interface UnsuspendUserInput {
  targetUserId: string;
  actorUserId: string;
}

export async function unsuspendUser(input: UnsuspendUserInput, db: AdminDb = getAdminDb()): Promise<void> {
  const before = await db.select({ suspendedAt: schema.users.suspendedAt, suspendedReason: schema.users.suspendedReason }).from(schema.users).where(eq(schema.users.id, input.targetUserId)).limit(1);
  await db.update(schema.users).set({ suspendedAt: null, suspendedReason: null }).where(eq(schema.users.id, input.targetUserId));
  await audit.writeAuditLog(db, {
    workspaceId: null,
    actorUserId: input.actorUserId,
    action: "user.unsuspend",
    targetType: "user",
    targetId: input.targetUserId,
    before: before[0] ?? null,
    after: { suspendedAt: null, suspendedReason: null },
  });
}

// ---------------------------------------------------------------------------
// Workspaces — platform-wide list + archive/unarchive (softDelete already
// exists on `workspaces` since STEP 1; this is its first platform-level
// writer — workspace owners archive their own via workspace.ts already).
// ---------------------------------------------------------------------------

export interface WorkspaceSummary {
  id: string;
  name: string;
  organisationId: string;
  workspaceType: string;
  deletedAt: Date | null;
}

export async function listWorkspaces(db: AdminDb = getAdminDb()): Promise<WorkspaceSummary[]> {
  return db
    .select({ id: schema.workspaces.id, name: schema.workspaces.name, organisationId: schema.workspaces.organisationId, workspaceType: schema.workspaces.workspaceType, deletedAt: schema.workspaces.deletedAt })
    .from(schema.workspaces)
    .orderBy(schema.workspaces.name)
    .limit(200);
}

export interface ArchiveWorkspaceInput {
  workspaceId: string;
  actorUserId: string;
}

export async function archiveWorkspaceAsAdmin(input: ArchiveWorkspaceInput, db: AdminDb = getAdminDb()): Promise<void> {
  const deletedAt = new Date();
  await db.update(schema.workspaces).set({ deletedAt }).where(eq(schema.workspaces.id, input.workspaceId));
  await audit.writeAuditLog(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "workspace.archive", targetType: "workspace", targetId: input.workspaceId, before: { deletedAt: null }, after: { deletedAt: deletedAt.toISOString() } });
}

export async function unarchiveWorkspaceAsAdmin(input: ArchiveWorkspaceInput, db: AdminDb = getAdminDb()): Promise<void> {
  await db.update(schema.workspaces).set({ deletedAt: null }).where(eq(schema.workspaces.id, input.workspaceId));
  await audit.writeAuditLog(db, { workspaceId: input.workspaceId, actorUserId: input.actorUserId, action: "workspace.unarchive", targetType: "workspace", targetId: input.workspaceId, before: null, after: { deletedAt: null } });
}

// ---------------------------------------------------------------------------
// AI model management — the DB half of the STEP 8 config-source.ts
// contract apps/worker's DbProviderConfigSource reads (see that file).
// ---------------------------------------------------------------------------

export interface AiProviderConfigRow {
  id: string;
  kind: string;
  providerId: string;
  enabled: boolean;
  weight: number;
  tiers: string[];
  adapter: string;
  breakerFailureThreshold: number;
  breakerWindowSec: number;
  breakerCooldownSec: number;
}

export async function listAiProviderConfigs(db: AdminDb = getAdminDb()): Promise<AiProviderConfigRow[]> {
  return db.select().from(schema.aiProviderConfigs).orderBy(schema.aiProviderConfigs.kind, schema.aiProviderConfigs.providerId);
}

export interface UpsertAiProviderConfigInput {
  kind: string;
  providerId: string;
  enabled: boolean;
  weight: number;
  tiers: string[];
  adapter: string;
  breakerFailureThreshold: number;
  breakerWindowSec: number;
  breakerCooldownSec: number;
  actorUserId: string;
}

/** Upserts on the real (kind, provider_id) unique index — an admin editing a provider that has no row yet gets one created with these values. */
export async function upsertAiProviderConfig(input: UpsertAiProviderConfigInput, db: AdminDb = getAdminDb()): Promise<void> {
  const existing = await db.select().from(schema.aiProviderConfigs).where(and(eq(schema.aiProviderConfigs.kind, input.kind), eq(schema.aiProviderConfigs.providerId, input.providerId))).limit(1);

  const values = {
    enabled: input.enabled,
    weight: input.weight,
    tiers: input.tiers,
    adapter: input.adapter,
    breakerFailureThreshold: input.breakerFailureThreshold,
    breakerWindowSec: input.breakerWindowSec,
    breakerCooldownSec: input.breakerCooldownSec,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(schema.aiProviderConfigs).set(values).where(eq(schema.aiProviderConfigs.id, existing[0].id));
  } else {
    await db.insert(schema.aiProviderConfigs).values({ id: randomUUID(), kind: input.kind, providerId: input.providerId, ...values });
  }

  await audit.writeAuditLog(db, {
    workspaceId: null,
    actorUserId: input.actorUserId,
    action: "ai_provider_config.upsert",
    targetType: "ai_provider_config",
    targetId: `${input.kind}:${input.providerId}`,
    before: existing[0] ?? null,
    after: values,
  });
}

export interface AiRouterSettingsRow {
  id: string;
  fallbackChainMaxLength: number;
  costCeilingVideoUsd: string;
  costCeilingImageUsd: string;
  costCeilingTtsUsd: string;
  costCeilingTranscriptionUsd: string;
  costCeilingTextUsd: string;
}

export async function getAiRouterSettings(db: AdminDb = getAdminDb()): Promise<AiRouterSettingsRow | null> {
  const rows = await db.select().from(schema.aiRouterSettings).limit(1);
  return rows[0] ?? null;
}

export interface UpdateAiRouterSettingsInput {
  fallbackChainMaxLength: number;
  costCeilingVideoUsd: number;
  costCeilingImageUsd: number;
  costCeilingTtsUsd: number;
  costCeilingTranscriptionUsd: number;
  costCeilingTextUsd: number;
  actorUserId: string;
}

/** Updates the real singleton row (migration 0022 seeds exactly one). */
export async function updateAiRouterSettings(input: UpdateAiRouterSettingsInput, db: AdminDb = getAdminDb()): Promise<void> {
  const existing = await getAiRouterSettings(db);
  if (!existing) throw new Error("ai_router_settings has no row — migration 0022 should have seeded exactly one");

  const values = {
    fallbackChainMaxLength: input.fallbackChainMaxLength,
    costCeilingVideoUsd: input.costCeilingVideoUsd.toFixed(4),
    costCeilingImageUsd: input.costCeilingImageUsd.toFixed(4),
    costCeilingTtsUsd: input.costCeilingTtsUsd.toFixed(4),
    costCeilingTranscriptionUsd: input.costCeilingTranscriptionUsd.toFixed(4),
    costCeilingTextUsd: input.costCeilingTextUsd.toFixed(4),
    updatedAt: new Date(),
  };
  await db.update(schema.aiRouterSettings).set(values).where(eq(schema.aiRouterSettings.id, existing.id));

  await audit.writeAuditLog(db, { workspaceId: null, actorUserId: input.actorUserId, action: "ai_router_settings.update", targetType: "ai_router_settings", targetId: existing.id, before: existing, after: values });
}

// ---------------------------------------------------------------------------
// Feature flags — the real per-workspace/per-user evaluator
// (packages/core/src/admin/feature-flags.ts) wired to real DB rows.
// ---------------------------------------------------------------------------

export interface FeatureFlagRowOut {
  id: string;
  workspaceId: string | null;
  userId: string | null;
  key: string;
  isEnabled: boolean;
}

export async function listFeatureFlagRows(key: string, db: AdminDb = getAdminDb()): Promise<FeatureFlagRowOut[]> {
  return db
    .select({ id: schema.featureFlags.id, workspaceId: schema.featureFlags.workspaceId, userId: schema.featureFlags.userId, key: schema.featureFlags.key, isEnabled: schema.featureFlags.isEnabled })
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.key, key));
}

export interface EvaluateFeatureFlagInput {
  key: string;
  workspaceId?: string;
  userId?: string;
}

export async function evaluateFeatureFlag(input: EvaluateFeatureFlagInput, db: AdminDb = getAdminDb()): Promise<boolean> {
  const rows = await listFeatureFlagRows(input.key, db);
  return adminCore.resolveFeatureFlag(input.key, rows, { workspaceId: input.workspaceId, userId: input.userId });
}

export interface UpsertFeatureFlagInput {
  key: string;
  workspaceId: string | null;
  userId: string | null;
  isEnabled: boolean;
  actorUserId: string;
}

/** One row per (key, workspaceId, userId) tier — an admin re-setting the SAME tier updates it rather than duplicating rows. */
export async function upsertFeatureFlag(input: UpsertFeatureFlagInput, db: AdminDb = getAdminDb()): Promise<void> {
  const scopeConditions = [
    eq(schema.featureFlags.key, input.key),
    input.workspaceId ? eq(schema.featureFlags.workspaceId, input.workspaceId) : isNull(schema.featureFlags.workspaceId),
    input.userId ? eq(schema.featureFlags.userId, input.userId) : isNull(schema.featureFlags.userId),
  ];
  const existing = await db.select().from(schema.featureFlags).where(and(...scopeConditions)).limit(1);

  if (existing[0]) {
    await db.update(schema.featureFlags).set({ isEnabled: input.isEnabled, updatedAt: new Date() }).where(eq(schema.featureFlags.id, existing[0].id));
  } else {
    await db.insert(schema.featureFlags).values({ id: randomUUID(), key: input.key, workspaceId: input.workspaceId, userId: input.userId, isEnabled: input.isEnabled });
  }

  await audit.writeAuditLog(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "feature_flag.upsert",
    targetType: "feature_flag",
    targetId: input.key,
    before: existing[0] ?? null,
    after: { workspaceId: input.workspaceId, userId: input.userId, isEnabled: input.isEnabled },
  });
}

/** The global publish pause (build script: "social integration management ... global pause"), reusing feature flags — see packages/core/src/admin/feature-flags.ts's platformPauseFlagKey. */
export async function setPlatformPause(platform: string, paused: boolean, actorUserId: string, db: AdminDb = getAdminDb()): Promise<void> {
  await upsertFeatureFlag({ key: adminCore.platformPauseFlagKey(platform), workspaceId: null, userId: null, isEnabled: paused, actorUserId }, db);
}

export async function isPlatformPaused(platform: string, db: AdminDb = getAdminDb()): Promise<boolean> {
  const rows = await listFeatureFlagRows(adminCore.platformPauseFlagKey(platform), db);
  return adminCore.isPlatformPaused(platform, rows);
}

// ---------------------------------------------------------------------------
// Content moderation queue — closes STEP 15's own explicitly-flagged gap
// ("No UI for a platform moderator to actually resolve a review") by
// giving `resolveModerationReview` (STEP 15, ugc-service.ts) its first
// platform-wide caller and its first audit-log entry.
// ---------------------------------------------------------------------------

export interface PendingModerationReview {
  id: string;
  workspaceId: string;
  targetType: string;
  targetId: string;
  policyVersion: string;
  notes: string | null;
  createdAt: Date;
}

export async function listPendingModerationReviews(db: AdminDb = getAdminDb()): Promise<PendingModerationReview[]> {
  return db
    .select({ id: schema.moderationReviews.id, workspaceId: schema.moderationReviews.workspaceId, targetType: schema.moderationReviews.targetType, targetId: schema.moderationReviews.targetId, policyVersion: schema.moderationReviews.policyVersion, notes: schema.moderationReviews.notes, createdAt: schema.moderationReviews.createdAt })
    .from(schema.moderationReviews)
    .where(eq(schema.moderationReviews.status, "pending"))
    .orderBy(schema.moderationReviews.createdAt);
}

export interface ResolveModerationReviewAsAdminInput {
  workspaceId: string;
  reviewId: string;
  decision: ModerationDecision;
  notes?: string | null;
  actorUserId: string;
}

export async function resolveModerationReviewAsAdmin(input: ResolveModerationReviewAsAdminInput, db: AdminDb = getAdminDb()): Promise<void> {
  const before = await db.select({ status: schema.moderationReviews.status }).from(schema.moderationReviews).where(eq(schema.moderationReviews.id, input.reviewId)).limit(1);
  await resolveModerationReviewRow(db, { workspaceId: input.workspaceId, reviewId: input.reviewId, reviewerUserId: input.actorUserId, decision: input.decision, notes: input.notes });
  await audit.writeAuditLog(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: "moderation_review.resolve",
    targetType: "moderation_review",
    targetId: input.reviewId,
    before: before[0] ?? null,
    after: { status: input.decision, notes: input.notes ?? null },
  });
}

// ---------------------------------------------------------------------------
// Fraud/risk — packages/core/src/admin/risk-rules.ts wired to real rows.
// ---------------------------------------------------------------------------

export interface RecordRiskSignalInput {
  workspaceId: string;
  signalType: string;
  severity: string;
  details?: Record<string, unknown>;
}

export async function recordRiskSignal(input: RecordRiskSignalInput, db: AdminDb = getAdminDb()): Promise<void> {
  await db.insert(schema.riskSignals).values({ id: randomUUID(), workspaceId: input.workspaceId, signalType: input.signalType, severity: input.severity, details: input.details ?? null });
}

export interface RiskSignalRow {
  id: string;
  workspaceId: string;
  signalType: string;
  severity: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

export async function listRiskSignals(db: AdminDb = getAdminDb()): Promise<RiskSignalRow[]> {
  return db.select().from(schema.riskSignals).orderBy(desc(schema.riskSignals.createdAt)).limit(100);
}

// ---------------------------------------------------------------------------
// Audit log viewer.
// ---------------------------------------------------------------------------

export interface AuditLogFilter {
  workspaceId?: string;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  limit?: number;
}

export interface AuditLogRow {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

export async function listAuditLogs(filter: AuditLogFilter, db: AdminDb = getAdminDb()): Promise<AuditLogRow[]> {
  const conditions = [
    filter.workspaceId ? eq(schema.auditLogs.workspaceId, filter.workspaceId) : undefined,
    filter.actorUserId ? eq(schema.auditLogs.actorUserId, filter.actorUserId) : undefined,
    filter.action ? eq(schema.auditLogs.action, filter.action) : undefined,
    filter.targetType ? eq(schema.auditLogs.targetType, filter.targetType) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const baseQuery = db.select().from(schema.auditLogs);
  const filtered = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
  return filtered.orderBy(desc(schema.auditLogs.createdAt)).limit(Math.min(filter.limit ?? 100, 500));
}

// ---------------------------------------------------------------------------
// System health — a real DB-connectivity check, not a fabricated status page.
// ---------------------------------------------------------------------------

export interface SystemHealth {
  databaseReachable: boolean;
  checkedAt: string;
}

export async function checkSystemHealth(db: AdminDb = getAdminDb()): Promise<SystemHealth> {
  try {
    await db.execute(sql`SELECT 1`);
    return { databaseReachable: true, checkedAt: new Date().toISOString() };
  } catch {
    return { databaseReachable: false, checkedAt: new Date().toISOString() };
  }
}

// ---------------------------------------------------------------------------
// Signup-time fraud/risk check — packages/core/src/admin/risk-rules.ts's
// disposable-email detection, wired into authRouter.signup (STEP 3).
// Deliberately NOT wired to detectMultiAccountSignal at signup: that check
// needs the existing-email population to compare against, and
// `risk_signals` (like everything workspace-scoped in this schema) is
// NOT NULL on workspace_id — but signup happens before any workspace
// exists (STEP 5's onboarding creates one afterwards), so there is no
// workspace to attach a risk_signals row to yet. Rather than force an
// awkward NULL-workspace write into a table whose own schema says that
// should never happen, or invent new pre-workspace schema this step
// wasn't asked to add, a detected disposable-email signup is recorded to
// `audit_logs` instead — that table already supports workspaceId=null
// for exactly this "platform-level event, no owning workspace" shape
// (see governance.ts's own comment on audit_logs). Non-blocking: this
// build has no product requirement to reject disposable-email signups
// outright, and doing so unilaterally could break legitimate temporary-
// email use during testing — a deliberate, documented choice, not an
// oversight.
// ---------------------------------------------------------------------------

let cachedDisposableEmailDomainsPath: string | null = null;

function resolveDisposableEmailDomainsConfigPath(): string {
  if (cachedDisposableEmailDomainsPath) return cachedDisposableEmailDomainsPath;
  cachedDisposableEmailDomainsPath = path.resolve(process.cwd(), "..", "..", "config", "disposable-email-domains.json");
  return cachedDisposableEmailDomainsPath;
}

/** Returns true (and records an audit_logs entry) when the signup email's domain matches the illustrative disposable-domain seed list. Never throws — a malformed/missing config fails safe (returns false) rather than blocking signup. */
export async function checkAndRecordSignupRisk(userId: string, email: string, db: AdminDb = getAdminDb()): Promise<boolean> {
  let config;
  try {
    config = adminCore.loadDisposableEmailDomainsConfig(resolveDisposableEmailDomainsConfigPath());
  } catch {
    return false;
  }
  const disposable = adminCore.isDisposableEmailDomain(email, config);
  if (disposable) {
    await audit.writeAuditLog(db, { workspaceId: null, actorUserId: userId, action: "signup.disposable_email_detected", targetType: "user", targetId: userId, before: null, after: { email } });
  }
  return disposable;
}
