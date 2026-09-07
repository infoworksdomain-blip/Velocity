import { randomUUID } from "node:crypto";
import { analytics } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
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
