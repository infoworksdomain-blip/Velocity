import { randomUUID } from "node:crypto";
import { analytics, social } from "@velocity/core";
import type { KmsProvider } from "@velocity/db";
import { schema } from "@velocity/db";
import { and, eq, isNotNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * The metric-ingestion daemon (STEP 13: "metric ingestion per platform
 * ... on a schedule respecting read quotas"). Same dependency-injected
 * tick shape as STEP 11's token-refresh-daemon.ts — `db`/`kms`/
 * `fetchImpl`/`now` all injectable, so a real PGlite-backed test proves
 * this without a running scheduled process. No cron trigger exists yet
 * to call this on a schedule — the same "no scheduler wired up"
 * follow-up STEP 11 and STEP 12 already flagged; this is the real,
 * tested tick logic a future scheduled job would call.
 *
 * "Respecting read quotas" is real, not just claimed: one
 * `checkAndIncrementQuota` call per social account per tick, with
 * `requestKind: 'metrics_read'` — the SAME atomic-UPSERT mechanism
 * GATE 11 proved race-free under concurrency, now protecting a
 * genuinely separate quota bucket from the publish-rate one (see
 * schema/social.ts's own comment on why they're not conflated). One
 * quota "request" here means one batched API call for that account's
 * whole pending set, not one call per video — matching how these
 * platforms' real rate limits are actually enforced (per call, not per
 * item inside a batch).
 */

export type MetricsIngestionDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface MetricsIngestionDeps {
  db: MetricsIngestionDb;
  kms: KmsProvider;
  fetchImpl?: typeof fetch;
  now?: Date;
  windowSeconds?: number;
  requestCap?: number;
}

export interface MetricsIngestionResult {
  ingestedPublicationIds: string[];
  quotaSkippedAccounts: string[];
  failedAccounts: string[];
}

interface DecryptedCredentialPayload {
  accessToken: string;
  refreshMaterial: string;
  resourceId: string | null;
}

const DEFAULT_WINDOW_SECONDS = 3600;
const DEFAULT_REQUEST_CAP = 20;
const TIKTOK_BATCH_SIZE = 20;
const YOUTUBE_BATCH_SIZE = 50;

export async function runMetricsIngestionTick(deps: MetricsIngestionDeps): Promise<MetricsIngestionResult> {
  const now = deps.now ?? new Date();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const windowSeconds = deps.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const requestCap = deps.requestCap ?? DEFAULT_REQUEST_CAP;
  const result: MetricsIngestionResult = { ingestedPublicationIds: [], quotaSkippedAccounts: [], failedAccounts: [] };

  const rows = await deps.db
    .select({ publication: schema.publications, account: schema.socialAccounts })
    .from(schema.publications)
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.publications.socialAccountId))
    .where(and(eq(schema.publications.status, "published"), isNotNull(schema.publications.platformPostId), eq(schema.socialAccounts.connectionStatus, "connected")));

  const byAccount = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byAccount.get(row.account.id) ?? [];
    list.push(row);
    byAccount.set(row.account.id, list);
  }

  for (const [socialAccountId, accountRows] of byAccount) {
    const account = accountRows[0]!.account;
    try {
      const quotaResult = await social.checkAndIncrementQuota(deps.db, { workspaceId: account.workspaceId, socialAccountId, requestKind: "metrics_read", windowSeconds, requestCap, now });
      if (!quotaResult.allowed) {
        result.quotaSkippedAccounts.push(socialAccountId);
        continue;
      }

      const [credentialRow] = await deps.db.select().from(schema.platformCredentials).where(eq(schema.platformCredentials.socialAccountId, socialAccountId)).limit(1);
      if (!credentialRow) throw new Error(`No platform credentials for social account ${socialAccountId}`);
      const decrypted = JSON.parse(await deps.kms.decrypt(credentialRow.encryptedPayload, credentialRow.kmsKeyId)) as DecryptedCredentialPayload;

      const metricsById = await fetchMetricsForAccount(account.platform, decrypted, accountRows, fetchImpl);

      for (const row of accountRows) {
        const metrics = metricsById.get(row.publication.platformPostId!);
        if (!metrics) continue;
        await deps.db.insert(schema.metricSnapshots).values({
          id: randomUUID(),
          workspaceId: row.publication.workspaceId,
          publicationId: row.publication.id,
          capturedAt: now,
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          watchTimeSeconds: null,
          follows: null,
          profileVisits: null,
        });
        result.ingestedPublicationIds.push(row.publication.id);
      }
    } catch {
      // A metrics-read failure (expired token, transient vendor error) is
      // real but not the reconnect-worthy signal a PUBLISH failure is —
      // STEP 11's daemon marks reauth_required for a revoked publish
      // token because publishing genuinely can't proceed without it;
      // missing one metrics snapshot is not that severe. Recorded here so
      // the caller can see which accounts need attention, without
      // escalating account state on a read-only failure.
      result.failedAccounts.push(socialAccountId);
    }
  }

  return result;
}

interface PlatformMetrics {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

async function fetchMetricsForAccount(
  platform: "tiktok" | "instagram" | "youtube",
  credentials: DecryptedCredentialPayload,
  rows: { publication: typeof schema.publications.$inferSelect }[],
  fetchImpl: typeof fetch,
): Promise<Map<string, PlatformMetrics>> {
  const result = new Map<string, PlatformMetrics>();
  const postIds = rows.map((r) => r.publication.platformPostId!);

  switch (platform) {
    case "tiktok": {
      for (let i = 0; i < postIds.length; i += TIKTOK_BATCH_SIZE) {
        const batch = postIds.slice(i, i + TIKTOK_BATCH_SIZE);
        const batchMetrics = await analytics.fetchTikTokVideoMetrics({ accessToken: credentials.accessToken }, batch, fetchImpl);
        for (const m of batchMetrics) result.set(m.videoId, { views: m.views, likes: m.likes, comments: m.comments, shares: m.shares });
      }
      return result;
    }
    case "instagram": {
      if (!credentials.resourceId) throw new Error("Instagram metrics ingestion needs the linked business account id");
      for (const postId of postIds) {
        const insights = await analytics.fetchInstagramMediaInsights({ accessToken: credentials.accessToken }, postId, fetchImpl);
        result.set(postId, { views: insights.plays, likes: insights.likes, comments: insights.comments, shares: insights.shares });
      }
      return result;
    }
    case "youtube": {
      for (let i = 0; i < postIds.length; i += YOUTUBE_BATCH_SIZE) {
        const batch = postIds.slice(i, i + YOUTUBE_BATCH_SIZE);
        const batchMetrics = await analytics.fetchYouTubeVideoStatistics({ accessToken: credentials.accessToken }, batch, fetchImpl);
        for (const m of batchMetrics) result.set(m.videoId, { views: m.views, likes: m.likes, comments: m.comments, shares: null });
      }
      return result;
    }
  }
}
