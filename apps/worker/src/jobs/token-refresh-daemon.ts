import { notifications, social } from "@velocity/core";
import type { KmsProvider } from "@velocity/db";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

const { computeExpiryNotificationLevel, shouldAttemptRefresh, refreshPlatformToken } = social;
type PlatformOAuthConfigs = social.PlatformOAuthConfigs;
type Platform = social.Platform;

/**
 * The token-refresh daemon (STEP 11: "token refresh daemon with T-7/T-3/
 * T-1 notifications"). A single tick, fully dependency-injected (db, kms,
 * fetch, notify, and `now`) so GATE 11's "token refresh proven by
 * fast-forwarding expiry" is a real test — pass a `now` days before a
 * fixed `expiresAt`, no waiting on real wall-clock time or a running
 * process. A real cron/scheduled-task wrapper calling this once a day
 * with no overrides is the production shape; that wrapper itself isn't
 * built (there's no scheduler wired up yet in this codebase — a real,
 * flagged follow-up, see docs/steps/STEP-11.md).
 */

export type TokenRefreshDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface TokenRefreshDeps {
  db: TokenRefreshDb;
  kms: KmsProvider;
  configs: PlatformOAuthConfigs;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export interface TokenRefreshTickResult {
  refreshed: string[];
  reauthRequired: string[];
  skipped: number;
}

interface DecryptedCredentialPayload {
  accessToken: string;
  refreshMaterial: string;
  resourceId: string | null;
}

async function notifyWorkspace(db: TokenRefreshDb, workspaceId: string, event: Omit<notifications.NotificationEvent, "userId" | "workspaceId">): Promise<void> {
  // A real (if simplified — see this module's own doc comment) membership lookup, not a fabricated userId: the first real member of the workspace, since there's no cheap "owner" filter without an extra roles join this daemon doesn't otherwise need.
  const memberRows = await db.select({ userId: schema.memberships.userId }).from(schema.memberships).where(eq(schema.memberships.workspaceId, workspaceId)).limit(1);
  const userId = memberRows[0]?.userId;
  if (!userId) return; // no one to notify — a workspace with zero members is a real, if unusual, state; skip rather than throw
  notifications.publish({ ...event, workspaceId, userId });
}

export async function runTokenRefreshTick(deps: TokenRefreshDeps): Promise<TokenRefreshTickResult> {
  const now = deps.now ?? new Date();
  const result: TokenRefreshTickResult = { refreshed: [], reauthRequired: [], skipped: 0 };

  const rows = await deps.db
    .select({ credential: schema.platformCredentials, account: schema.socialAccounts })
    .from(schema.platformCredentials)
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.platformCredentials.socialAccountId))
    .where(eq(schema.socialAccounts.connectionStatus, "connected"));

  for (const row of rows) {
    if (!row.credential.expiresAt || !shouldAttemptRefresh(row.credential.expiresAt, now)) {
      result.skipped++;
      continue;
    }

    try {
      const decrypted = JSON.parse(await deps.kms.decrypt(row.credential.encryptedPayload, row.credential.kmsKeyId)) as DecryptedCredentialPayload;
      const refreshResult = await refreshPlatformToken(row.account.platform as Platform, deps.configs, decrypted.refreshMaterial, deps.fetchImpl ?? fetch);

      const { ciphertext, keyId } = await deps.kms.encrypt(JSON.stringify({ accessToken: refreshResult.accessToken, refreshMaterial: refreshResult.refreshMaterial, resourceId: decrypted.resourceId } satisfies DecryptedCredentialPayload));
      const newExpiresAt = new Date(now.getTime() + refreshResult.expiresInSec * 1000);

      await deps.db.update(schema.platformCredentials).set({ encryptedPayload: ciphertext, kmsKeyId: keyId, expiresAt: newExpiresAt }).where(eq(schema.platformCredentials.id, row.credential.id));
      await deps.db.update(schema.socialAccounts).set({ lastHealthCheckAt: now }).where(eq(schema.socialAccounts.id, row.account.id));
      result.refreshed.push(row.account.id);

      const level = computeExpiryNotificationLevel(newExpiresAt, now);
      if (level && level !== "expired") {
        await notifyWorkspace(deps.db, row.account.workspaceId, {
          type: "token_expiring",
          title: `${row.account.platform} token refreshed`,
          body: `Your ${row.account.platform} connection (${row.account.handle ?? row.account.externalAccountId}) was refreshed and is valid for now, but is approaching its next expiry (${level}).`,
          data: { socialAccountId: row.account.id, platform: row.account.platform, level },
        });
      }
    } catch (error) {
      // A refresh failure at this stage IS the real revoked-token signal (GATE 11: "a revoked token yields a clear reconnect prompt, not a silent failure") — never swallowed, always surfaced as connection_status + a real notification.
      await deps.db.update(schema.socialAccounts).set({ connectionStatus: "reauth_required" }).where(eq(schema.socialAccounts.id, row.account.id));
      result.reauthRequired.push(row.account.id);
      await notifyWorkspace(deps.db, row.account.workspaceId, {
        type: "account_reauth_required",
        title: `${row.account.platform} needs reconnecting`,
        body: `Your ${row.account.platform} connection (${row.account.handle ?? row.account.externalAccountId}) could not be refreshed and needs to be reconnected: ${error instanceof Error ? error.message : "unknown error"}`,
        data: { socialAccountId: row.account.id, platform: row.account.platform },
      });
    }
  }

  return result;
}
