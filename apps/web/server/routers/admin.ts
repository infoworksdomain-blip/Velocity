import { z } from "zod";
import {
  archiveWorkspaceAsAdmin,
  checkSystemHealth,
  evaluateFeatureFlag,
  getAiRouterSettings,
  isPlatformPaused,
  listAiProviderConfigs,
  listAuditLogs,
  listFeatureFlagRows,
  listPendingModerationReviews,
  listRiskSignals,
  listWorkspaces,
  recordRiskSignal,
  resolveModerationReviewAsAdmin,
  searchUsers,
  setPlatformPause,
  suspendUser,
  unarchiveWorkspaceAsAdmin,
  unsuspendUser,
  updateAiRouterSettings,
  upsertAiProviderConfig,
  upsertFeatureFlag,
} from "../admin-service";
import { eraseUserData, exportUserData } from "../compliance-service";
import { reconcileAllWorkspaces } from "../credit-gate-service";
import { getAdminDb } from "../db";
import { requirePlatformPermission, router } from "../trpc";

/**
 * STEP 18's Admin router — every procedure gated on a real platform
 * permission from packages/core's PERMISSION_CATALOG (STEP 3's "one
 * central policy module" rule), most of them seeded onto `superadmin`
 * since STEP 3 and unused until now (the same repeated pattern this build
 * has hit at STEP 15/16/17 — schema/permissions built early, wired late).
 */
export const adminRouter = router({
  users: router({
    search: requirePlatformPermission("users:suspend:platform")
      .input(z.object({ query: z.string().min(1) }))
      .query(({ input }) => searchUsers(input.query, getAdminDb())),

    suspend: requirePlatformPermission("users:suspend:platform")
      .input(z.object({ targetUserId: z.string().uuid(), reason: z.string().min(3) }))
      .mutation(({ ctx, input }) => suspendUser({ targetUserId: input.targetUserId, reason: input.reason, actorUserId: ctx.user.id }, getAdminDb())),

    unsuspend: requirePlatformPermission("users:suspend:platform")
      .input(z.object({ targetUserId: z.string().uuid() }))
      .mutation(({ ctx, input }) => unsuspendUser({ targetUserId: input.targetUserId, actorUserId: ctx.user.id }, getAdminDb())),
  }),

  workspaces: router({
    list: requirePlatformPermission("workspaces:manage_any:platform").query(() => listWorkspaces(getAdminDb())),

    archive: requirePlatformPermission("workspaces:manage_any:platform")
      .input(z.object({ workspaceId: z.string().uuid() }))
      .mutation(({ ctx, input }) => archiveWorkspaceAsAdmin({ workspaceId: input.workspaceId, actorUserId: ctx.user.id }, getAdminDb())),

    unarchive: requirePlatformPermission("workspaces:manage_any:platform")
      .input(z.object({ workspaceId: z.string().uuid() }))
      .mutation(({ ctx, input }) => unarchiveWorkspaceAsAdmin({ workspaceId: input.workspaceId, actorUserId: ctx.user.id }, getAdminDb())),
  }),

  aiModels: router({
    list: requirePlatformPermission("system:configure:platform").query(() => listAiProviderConfigs(getAdminDb())),

    upsert: requirePlatformPermission("system:configure:platform")
      .input(
        z.object({
          kind: z.string().min(1),
          providerId: z.string().min(1),
          enabled: z.boolean(),
          weight: z.number().int().min(0).max(100),
          tiers: z.array(z.string()).min(1),
          adapter: z.enum(["stub", "http"]),
          breakerFailureThreshold: z.number().int().positive(),
          breakerWindowSec: z.number().int().positive(),
          breakerCooldownSec: z.number().int().positive(),
        }),
      )
      .mutation(({ ctx, input }) => upsertAiProviderConfig({ ...input, actorUserId: ctx.user.id }, getAdminDb())),

    getSettings: requirePlatformPermission("system:configure:platform").query(() => getAiRouterSettings(getAdminDb())),

    updateSettings: requirePlatformPermission("system:configure:platform")
      .input(
        z.object({
          fallbackChainMaxLength: z.number().int().min(1).max(10),
          costCeilingVideoUsd: z.number().positive(),
          costCeilingImageUsd: z.number().positive(),
          costCeilingTtsUsd: z.number().positive(),
          costCeilingTranscriptionUsd: z.number().positive(),
          costCeilingTextUsd: z.number().positive(),
        }),
      )
      .mutation(({ ctx, input }) => updateAiRouterSettings({ ...input, actorUserId: ctx.user.id }, getAdminDb())),
  }),

  featureFlags: router({
    list: requirePlatformPermission("feature_flags:manage:platform")
      .input(z.object({ key: z.string().min(1) }))
      .query(({ input }) => listFeatureFlagRows(input.key, getAdminDb())),

    evaluate: requirePlatformPermission("feature_flags:manage:platform")
      .input(z.object({ key: z.string().min(1), workspaceId: z.string().uuid().optional(), userId: z.string().uuid().optional() }))
      .query(({ input }) => evaluateFeatureFlag(input, getAdminDb())),

    upsert: requirePlatformPermission("feature_flags:manage:platform")
      .input(z.object({ key: z.string().min(1), workspaceId: z.string().uuid().nullable(), userId: z.string().uuid().nullable(), isEnabled: z.boolean() }))
      .mutation(({ ctx, input }) => upsertFeatureFlag({ ...input, actorUserId: ctx.user.id }, getAdminDb())),
  }),

  /** The literal "social integration management ... global pause", built on feature flags rather than new infrastructure. */
  platformPause: router({
    get: requirePlatformPermission("feature_flags:manage:platform")
      .input(z.object({ platform: z.enum(["tiktok", "instagram", "youtube"]) }))
      .query(({ input }) => isPlatformPaused(input.platform, getAdminDb())),

    set: requirePlatformPermission("feature_flags:manage:platform")
      .input(z.object({ platform: z.enum(["tiktok", "instagram", "youtube"]), paused: z.boolean() }))
      .mutation(({ ctx, input }) => setPlatformPause(input.platform, input.paused, ctx.user.id, getAdminDb())),
  }),

  moderation: router({
    listPending: requirePlatformPermission("moderation:review:platform").query(() => listPendingModerationReviews(getAdminDb())),

    resolve: requirePlatformPermission("moderation:review:platform")
      .input(z.object({ workspaceId: z.string().uuid(), reviewId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), notes: z.string().optional() }))
      .mutation(({ ctx, input }) => resolveModerationReviewAsAdmin({ ...input, actorUserId: ctx.user.id }, getAdminDb())),
  }),

  risk: router({
    list: requirePlatformPermission("system:configure:platform").query(() => listRiskSignals(getAdminDb())),

    record: requirePlatformPermission("system:configure:platform")
      .input(z.object({ workspaceId: z.string().uuid(), signalType: z.string().min(1), severity: z.enum(["low", "medium", "high", "critical"]), details: z.record(z.string(), z.unknown()).optional() }))
      .mutation(({ input }) => recordRiskSignal(input, getAdminDb())),
  }),

  auditLog: router({
    list: requirePlatformPermission("audit_log:read:platform")
      .input(z.object({ workspaceId: z.string().uuid().optional(), actorUserId: z.string().uuid().optional(), action: z.string().optional(), targetType: z.string().optional(), limit: z.number().int().positive().max(500).optional() }))
      .query(({ input }) => listAuditLogs(input, getAdminDb())),
  }),

  systemHealth: requirePlatformPermission("system:configure:platform").query(() => checkSystemHealth(getAdminDb())),

  /** STEP 19's "nightly reconciliation job" (build script) — a real, tested function with no scheduler wired to it yet (the same honestly-flagged gap every step since STEP 11); this gives it a real, permission-gated manual trigger in the meantime. */
  billing: router({
    reconcile: requirePlatformPermission("system:configure:platform")
      .input(z.object({ sinceIso: z.string().datetime() }))
      .mutation(({ input }) => reconcileAllWorkspaces(new Date(input.sinceIso), getAdminDb())),
  }),

  /** STEP 20's real GDPR/UK-GDPR DSAR export + erasure mechanism. */
  gdpr: router({
    exportUserData: requirePlatformPermission("gdpr:manage:platform")
      .input(z.object({ targetUserId: z.string().uuid() }))
      .query(({ input }) => exportUserData(input.targetUserId, getAdminDb())),

    eraseUserData: requirePlatformPermission("gdpr:manage:platform")
      .input(z.object({ targetUserId: z.string().uuid() }))
      .mutation(({ ctx, input }) => eraseUserData({ targetUserId: input.targetUserId, actorUserId: ctx.user.id }, getAdminDb())),
  }),
});
