/**
 * STEP 18: the build script's own literal "feature flags evaluate per
 * workspace and per user" -- a real precedence resolver, one tier further
 * than STEP 4's workspace-override -> organisation-default -> platform-
 * default (packages/core/src/settings/resolve.ts). A `feature_flags` row
 * can independently set `workspaceId`, `userId`, both, or neither (the
 * global default); most-specific-wins, same shape as the settings
 * resolver. Pure function -- the caller (apps/web/server/admin-service.ts)
 * fetches every row matching the key via the admin DB connection (feature
 * flags are platform config, not tenant-owned data, so they're read
 * without RLS -- see that file's own comment) and passes them in here.
 */
export interface FeatureFlagRow {
  workspaceId: string | null;
  userId: string | null;
  key: string;
  isEnabled: boolean;
}

export interface FeatureFlagContext {
  workspaceId?: string;
  userId?: string;
}

/**
 * Precedence, most specific first:
 * 1. A row scoped to exactly this workspace AND this user.
 * 2. A row scoped to this user only (workspaceId null) -- a cross-
 *    workspace override for one person (e.g. an internal beta tester).
 * 3. A row scoped to this workspace only (userId null).
 * 4. The global row (workspaceId and userId both null).
 * An unknown key with no matching row at any tier fails closed (false).
 */
export function resolveFeatureFlag(key: string, rows: readonly FeatureFlagRow[], context: FeatureFlagContext): boolean {
  const forKey = rows.filter((row) => row.key === key);

  if (context.workspaceId && context.userId) {
    const exact = forKey.find((row) => row.workspaceId === context.workspaceId && row.userId === context.userId);
    if (exact) return exact.isEnabled;
  }

  if (context.userId) {
    const userScoped = forKey.find((row) => row.userId === context.userId && row.workspaceId === null);
    if (userScoped) return userScoped.isEnabled;
  }

  if (context.workspaceId) {
    const workspaceScoped = forKey.find((row) => row.workspaceId === context.workspaceId && row.userId === null);
    if (workspaceScoped) return workspaceScoped.isEnabled;
  }

  const global = forKey.find((row) => row.workspaceId === null && row.userId === null);
  return global?.isEnabled ?? false;
}

/**
 * The "global pause" mechanism (build script: "social integration
 * management ... global pause") reuses this same table rather than new
 * infrastructure -- a convention key, always evaluated with no workspace
 * or user context, so only the global tier can ever answer it.
 */
export function platformPauseFlagKey(platform: string): string {
  return `platform_pause:${platform}`;
}

export function isPlatformPaused(platform: string, rows: readonly FeatureFlagRow[]): boolean {
  return resolveFeatureFlag(platformPauseFlagKey(platform), rows, {});
}
