import { randomUUID } from "node:crypto";
import { analytics as analyticsCore, calendar, velocity as velocityCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { requireWorkspacePermission, router } from "../trpc";

const { aggregateByFormat, aggregateByAngle, aggregateByPersona, aggregateByPlatform, aggregateByHookPattern, aggregateByPublishCohort, detectOutliers, engagementRate, toCsv } = analyticsCore;
const { computePreferenceUpdatesFromPerformance } = velocityCore;
const { utcToZonedParts } = calendar;

const PERMISSION = "analytics:read:workspace";

/**
 * One real join, reused by every endpoint below: metric_snapshots ->
 * publications -> content_items -> content_concepts -> angles, plus
 * social_accounts for platform. `publishedAtLocalDate`/`localHour` use
 * `publications.created_at` as the publish-time proxy — STEP 12's
 * `triggerPublish` creates the publication row immediately before
 * starting the workflow, so this is a close, honest approximation, not
 * a dedicated "published_at" column this schema doesn't have.
 */
async function fetchMetricSamples(workspaceId: string, workspaceTimezone: string): Promise<analyticsCore.MetricSample[]> {
  const db = getAdminDb();
  const rows = await db
    .select({
      publicationId: schema.metricSnapshots.publicationId,
      platform: schema.socialAccounts.platform,
      format: schema.contentConcepts.format,
      angleKind: schema.angles.kind,
      personaId: schema.contentConcepts.personaId,
      hookPattern: schema.contentConcepts.hookPattern,
      publicationCreatedAt: schema.publications.createdAt,
      views: schema.metricSnapshots.views,
      likes: schema.metricSnapshots.likes,
      comments: schema.metricSnapshots.comments,
      shares: schema.metricSnapshots.shares,
    })
    .from(schema.metricSnapshots)
    .innerJoin(schema.publications, eq(schema.publications.id, schema.metricSnapshots.publicationId))
    .innerJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.publications.socialAccountId))
    .innerJoin(schema.contentItems, eq(schema.contentItems.id, schema.publications.contentItemId))
    .innerJoin(schema.contentConcepts, eq(schema.contentConcepts.id, schema.contentItems.contentConceptId))
    .innerJoin(schema.angles, eq(schema.angles.id, schema.contentConcepts.angleId))
    .where(eq(schema.metricSnapshots.workspaceId, workspaceId));

  return rows.map((row) => {
    const zoned = utcToZonedParts(row.publicationCreatedAt, workspaceTimezone);
    return {
      publicationId: row.publicationId,
      platform: row.platform,
      format: row.format,
      angleKind: row.angleKind,
      personaId: row.personaId,
      hookPattern: row.hookPattern,
      publishedAtLocalDate: `${zoned.year}-${String(zoned.month).padStart(2, "0")}-${String(zoned.day).padStart(2, "0")}`,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
    };
  });
}

async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  const db = getAdminDb();
  const rows = await db.select({ timezone: schema.workspaces.timezone }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  return rows[0]?.timezone ?? "UTC";
}

export const analyticsRouter = router({
  /** Dashboards per post, format, angle, persona, platform, hook pattern, and cohort by publish date (build script's literal list) — one endpoint, `groupBy` selects the dimension. */
  summary: requireWorkspacePermission(PERMISSION)
    .input(z.object({ groupBy: z.enum(["format", "angle", "persona", "platform", "hookPattern", "cohort"]) }))
    .query(async ({ ctx, input }) => {
      const timezone = await getWorkspaceTimezone(ctx.workspaceId);
      const samples = await fetchMetricSamples(ctx.workspaceId, timezone);
      switch (input.groupBy) {
        case "format":
          return aggregateByFormat(samples);
        case "angle":
          return aggregateByAngle(samples);
        case "persona":
          return aggregateByPersona(samples);
        case "platform":
          return aggregateByPlatform(samples);
        case "hookPattern":
          return aggregateByHookPattern(samples);
        case "cohort":
          return aggregateByPublishCohort(samples);
      }
    }),

  outliers: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => {
    const timezone = await getWorkspaceTimezone(ctx.workspaceId);
    const samples = await fetchMetricSamples(ctx.workspaceId, timezone);
    return detectOutliers(samples);
  }),

  exportCsv: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => {
    const timezone = await getWorkspaceTimezone(ctx.workspaceId);
    const samples = await fetchMetricSamples(ctx.workspaceId, timezone);
    return toCsv(
      samples.map((s) => ({
        publicationId: s.publicationId,
        platform: s.platform,
        format: s.format,
        angle: s.angleKind,
        hookPattern: s.hookPattern,
        publishedAtLocalDate: s.publishedAtLocalDate,
        views: s.views,
        likes: s.likes,
        comments: s.comments,
        shares: s.shares,
        engagementRate: engagementRate(s).toFixed(4),
      })),
    );
  }),

  /**
   * "Close the loop" (build script): applies real performance-derived
   * updates to velocity_preferences — the SAME atomic upsert routers/
   * velocity.ts's swipe handler already uses, generalized from a binary
   * swipe outcome to computePreferenceUpdatesFromPerformance's
   * statistical winner/loser signal. Manually triggered here (no
   * scheduler exists yet — see docs/steps/STEP-13.md) rather than
   * automatic; a future scheduled job would call this same logic.
   */
  closeLoop: requireWorkspacePermission(PERMISSION).mutation(async ({ ctx }) => {
    const timezone = await getWorkspaceTimezone(ctx.workspaceId);
    const samples = await fetchMetricSamples(ctx.workspaceId, timezone);
    const db = getAdminDb();

    const updates = computePreferenceUpdatesFromPerformance(
      samples.map((s) => ({
        publicationId: s.publicationId,
        concept: { angleKind: s.angleKind, format: s.format, personaId: s.personaId, blueprintId: null, hookPattern: s.hookPattern },
        engagementRate: engagementRate(s),
      })),
    );

    for (const update of updates) {
      await db
        .insert(schema.velocityPreferences)
        .values({ id: randomUUID(), workspaceId: ctx.workspaceId, dimensionKey: update.dimensionKey, alpha: 1 + update.alphaDelta, beta: 1 + update.betaDelta })
        .onConflictDoUpdate({
          target: [schema.velocityPreferences.workspaceId, schema.velocityPreferences.dimensionKey],
          set: { alpha: sql`${schema.velocityPreferences.alpha} + ${update.alphaDelta}`, beta: sql`${schema.velocityPreferences.beta} + ${update.betaDelta}`, updatedAt: new Date() },
        });
    }

    return { dimensionsUpdated: updates.length, samplesConsidered: samples.length };
  }),

  createShortLink: requireWorkspacePermission(PERMISSION)
    .input(z.object({ publicationId: z.string().uuid().nullable(), destinationUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const { createShortLink } = await import("../analytics-service");
      return createShortLink(getAdminDb(), { workspaceId: ctx.workspaceId, publicationId: input.publicationId, destinationUrl: input.destinationUrl });
    }),
});
