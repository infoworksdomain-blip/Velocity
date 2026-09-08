import { fileURLToPath } from "node:url";
import { admin, social, publish } from "@velocity/core";
import type { PreflightResult } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { getAdminDb, runInWorkspaceTx } from "../context.js";
import { runIdempotentStep } from "./publish-step-ledger.js";

const DEFAULT_QUOTA_WINDOW_SECONDS = 86400;
const DEFAULT_QUOTA_CAP = 15; // conservative default when no explicit cap is configured for the platform — real per-platform caps are set at connection time (apps/web/server/social-service.ts, reusing STEP 10's platform-caps.json)

let mediaSpecsConfigPath: string | null = null;
function resolveMediaSpecsPath(): string {
  if (mediaSpecsConfigPath) return mediaSpecsConfigPath;
  mediaSpecsConfigPath = process.env.VELOCITY_PLATFORM_MEDIA_SPECS_CONFIG ?? fileURLToPath(new URL("../../../../../../config/platform-media-specs.json", import.meta.url));
  return mediaSpecsConfigPath;
}

export interface PreflightActivityInput {
  workspaceId: string;
  publicationId: string;
  contentItemId: string;
  renderId: string;
  socialAccountId: string;
  platform: "tiktok" | "instagram" | "youtube";
}

/**
 * Runs every preflight check the build script lists, but only actually
 * CONSUMES quota (via `checkAndIncrementQuota`, a real counter increment)
 * once every other check has already passed — a request that would fail
 * on QC/approval/spec grounds shouldn't burn a workspace's rate-limited
 * quota window for nothing. Memoized via the ledger: a retried preflight
 * never double-increments quota for the same publication.
 */
export async function preflightCheck(input: PreflightActivityInput): Promise<PreflightResult> {
  // STEP 18's global kill switch — read via the admin (RLS-bypassing)
  // connection BEFORE opening the workspace transaction below, never
  // inside it: runIdempotentStep holds one transaction open for its
  // whole check-claim-compute-persist sequence (its own doc comment),
  // and nesting a second top-level query through a DIFFERENT connection
  // handle inside that open transaction is a real contention hazard in
  // this test harness (PGlite backs both `getAdminDb()` and the
  // workspace transaction with the SAME single underlying connection in
  // tests, unlike production's genuinely separate connection pools) —
  // found via a real, reproducible slowdown/deadlock-prone pattern
  // across the publish-workflow test suite. ProviderRegistry's own TTL
  // reload doesn't apply here (this is a per-call DB read, not a cached
  // router config), so a pause takes effect on literally the next
  // preflight call, well inside GATE 18's 60-second bound.
  const pauseKey = admin.platformPauseFlagKey(input.platform);
  const pauseRows = await getAdminDb()
    .select({ workspaceId: schema.featureFlags.workspaceId, userId: schema.featureFlags.userId, key: schema.featureFlags.key, isEnabled: schema.featureFlags.isEnabled })
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.key, pauseKey));
  const platformPaused = admin.isPlatformPaused(input.platform, pauseRows);

  return runIdempotentStep({ runInWorkspaceTx: (fn) => runInWorkspaceTx(input.workspaceId, fn), workspaceId: input.workspaceId, publicationId: input.publicationId, stepKind: "preflight" }, async (db) => {
    const [renderRow] = await db.select().from(schema.renders).where(eq(schema.renders.id, input.renderId)).limit(1);
    const [contentItemRow] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, input.contentItemId)).limit(1);
    const [socialAccountRow] = await db.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.id, input.socialAccountId)).limit(1);
    if (!renderRow || !contentItemRow || !socialAccountRow) {
      return { passed: false, failureKind: "terminal", reasons: ["Publication references a render, content item, or social account that no longer exists."], mediaUrl: null } satisfies PreflightResult;
    }

    const mediaSpecsConfig = publish.loadPlatformMediaSpecsConfig(resolveMediaSpecsPath());
    const mediaSpec = publish.mediaSpecFor(mediaSpecsConfig, input.platform);

    // First pass: every non-quota check, with quota assumed OK — decides whether it's even worth consuming quota.
    const dryRun = publish.runPreflightChecks({
      platform: input.platform,
      render: { qcPassed: renderRow.qcPassed, aiGenerated: renderRow.aiGenerated, durationMs: renderRow.durationMs, outputStorageKey: renderRow.outputStorageKey },
      contentItem: { approvedByUserId: contentItemRow.approvedByUserId, approvedAt: contentItemRow.approvedAt },
      socialAccount: { connectionStatus: socialAccountRow.connectionStatus },
      quota: { allowed: true },
      mediaSpec,
      platformPaused,
    });
    if (!dryRun.passed) return dryRun;

    const quotaResult = await social.checkAndIncrementQuota(db, {
      workspaceId: input.workspaceId,
      socialAccountId: input.socialAccountId,
      requestKind: "publish",
      windowSeconds: DEFAULT_QUOTA_WINDOW_SECONDS,
      requestCap: DEFAULT_QUOTA_CAP,
    });

    if (!quotaResult.allowed) {
      return { passed: false, failureKind: "quota", reasons: ["No quota headroom for this account's current rolling window."], mediaUrl: null } satisfies PreflightResult;
    }

    // mediaUrl is resolved by the separate mediaStage step (its own literal
    // step name in the build script) — preflight only decides pass/fail.
    return { passed: true, failureKind: null, reasons: [], mediaUrl: null } satisfies PreflightResult;
  });
}
