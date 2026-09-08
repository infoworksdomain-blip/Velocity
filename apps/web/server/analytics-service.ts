import { randomUUID } from "node:crypto";
import { analytics, velocity as velocityCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

const MAX_SLUG_ATTEMPTS = 5;

/**
 * The same generic base type apps/worker's step-ledger.ts/quota.ts use —
 * every function here takes `db` as a parameter rather than calling
 * `getAdminDb()` internally, so the exact same code runs against a real
 * embedded Postgres (PGlite) in tests and the real network Postgres in
 * production. This closes the "apps/web has no PGlite-style DB-
 * integration test harness" gap flagged since STEP 9 for THIS module
 * specifically — STEP 13's website-attribution funnel (click -> signup
 * -> conversion) is real enough to be worth genuinely testing end to
 * end, not left DEFERRED for no reason beyond precedent.
 */
export type AnalyticsDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CreateShortLinkInput {
  workspaceId: string;
  publicationId: string | null;
  destinationUrl: string;
}

export interface CreateShortLinkResult {
  linkShortId: string;
  slug: string;
}

/**
 * website attribution — the short-link half (STEP 13). `onConflictDoNothing`
 * + a retry loop, not a caught unique-violation error: a slug collision is
 * real but rare (see short-link.ts), and this is the same "insert, check
 * whether it actually landed" shape the codebase already uses for
 * idempotency keys (publish-service.ts) and quota rows (quota.ts), applied
 * to a genuinely different kind of uniqueness (random collision, not
 * logical dedup). `slugGenerator` defaults to the real generator but is
 * injectable — the same DI seam this codebase already uses for randomness
 * (bandit.ts's `RandomSource`) and HTTP (`fetchImpl`) — so a test can force
 * a real collision on the first attempt without monkey-patching a module.
 */
export async function createShortLink(db: AnalyticsDb, input: CreateShortLinkInput, slugGenerator: () => string = analytics.generateSlug): Promise<CreateShortLinkResult> {
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = slugGenerator();
    const id = randomUUID();
    const inserted = await db
      .insert(schema.linkShorts)
      .values({ id, workspaceId: input.workspaceId, publicationId: input.publicationId, slug, destinationUrl: input.destinationUrl })
      .onConflictDoNothing({ target: schema.linkShorts.slug })
      .returning({ id: schema.linkShorts.id });
    if (inserted.length > 0) return { linkShortId: id, slug };
  }
  throw new Error(`Failed to generate a unique short-link slug after ${MAX_SLUG_ATTEMPTS} attempts`);
}

export interface RecordClickResult {
  clickEventId: string;
  destinationUrl: string;
}

/** app/api/s/[slug]/route.ts's actual work, extracted so it's testable against PGlite — see AnalyticsDb's own doc comment. Returns null for an unknown slug; the route handler turns that into a 404. */
export async function recordClick(db: AnalyticsDb, slug: string): Promise<RecordClickResult | null> {
  const rows = await db.select().from(schema.linkShorts).where(eq(schema.linkShorts.slug, slug)).limit(1);
  const link = rows[0];
  if (!link) return null;

  const clickEventId = randomUUID();
  await db.insert(schema.attributionEvents).values({ id: clickEventId, workspaceId: link.workspaceId, linkShortId: link.id, eventType: "click" });
  return { clickEventId, destinationUrl: link.destinationUrl };
}

/** app/api/track/route.ts's actual work. Returns false for an unknown vclid; the route handler turns that into a 404. `vclid` itself is the authorization (see the route handler's own doc comment) — this function does no separate auth check. */
export async function recordAttributionEvent(db: AnalyticsDb, vclid: string, eventType: "signup" | "conversion", externalRef: string | null): Promise<boolean> {
  const clickRows = await db.select().from(schema.attributionEvents).where(eq(schema.attributionEvents.id, vclid)).limit(1);
  const clickEvent = clickRows[0];
  if (!clickEvent) return false;

  await db.insert(schema.attributionEvents).values({
    id: randomUUID(),
    workspaceId: clickEvent.workspaceId,
    linkShortId: clickEvent.linkShortId,
    eventType,
    externalRef,
    metadata: { clickEventId: vclid },
  });
  return true;
}

/**
 * The exact atomic upsert routers/analytics.ts's `closeLoop` mutation used
 * to apply real performance-derived updates to `velocity_preferences`,
 * extracted here (STEP 16) so it has ONE implementation shared by that
 * router AND the automation engine's `boost_winner_variants` action
 * (packages/core/src/automation) — the same "extract a shared service
 * function rather than let two call sites drift" pattern already used for
 * `previewAutoFillForWorkspace`/`extractBlueprintForCompetitor`.
 */
export async function applyPreferenceUpdates(db: AnalyticsDb, workspaceId: string, updates: velocityCore.PreferenceUpdate[]): Promise<{ dimensionsUpdated: number }> {
  for (const update of updates) {
    await db
      .insert(schema.velocityPreferences)
      .values({ id: randomUUID(), workspaceId, dimensionKey: update.dimensionKey, alpha: 1 + update.alphaDelta, beta: 1 + update.betaDelta })
      .onConflictDoUpdate({
        target: [schema.velocityPreferences.workspaceId, schema.velocityPreferences.dimensionKey],
        set: { alpha: sql`${schema.velocityPreferences.alpha} + ${update.alphaDelta}`, beta: sql`${schema.velocityPreferences.beta} + ${update.betaDelta}`, updatedAt: new Date() },
      });
  }
  return { dimensionsUpdated: updates.length };
}

/**
 * STEP 21's literal "cost per published post tracked as a first-class
 * metric". Real data this build already tracks accurately, not a new
 * meter: `renders.cost_usd` is the atomically-accumulated sum of every
 * metered provider call for that render (STEP 8's C5 metering, step-
 * ledger.ts's atomic SQL increment, never read-then-write). Sums EVERY
 * render tied to a published content item — including any regeneration
 * rounds — since the real unit-economics question is "what did it cost,
 * in total, to get this piece published," not just the winning render's
 * own cost.
 */
export async function getCostPerPublishedPost(db: AnalyticsDb, workspaceId: string): Promise<analytics.CostPerPublishedPostResult> {
  const publishedContentItemIds = await db
    .selectDistinct({ contentItemId: schema.publications.contentItemId })
    .from(schema.publications)
    .where(and(eq(schema.publications.workspaceId, workspaceId), eq(schema.publications.status, "published")));

  const publishedPostCount = publishedContentItemIds.length;
  if (publishedPostCount === 0) return analytics.computeCostPerPublishedPost(0, 0);

  const contentItemIds = publishedContentItemIds.map((row) => row.contentItemId);
  const costRows = await db
    .select({ totalCostUsd: sql<string>`COALESCE(SUM(${schema.renders.costUsd}), 0)` })
    .from(schema.renders)
    .where(and(eq(schema.renders.workspaceId, workspaceId), inArray(schema.renders.contentItemId, contentItemIds)));

  const totalCostUsd = Number(costRows[0]?.totalCostUsd ?? 0);
  return analytics.computeCostPerPublishedPost(totalCostUsd, publishedPostCount);
}
