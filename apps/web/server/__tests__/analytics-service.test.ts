// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createShortLink, getCostPerPublishedPost, recordAttributionEvent, recordClick } from "../analytics-service";

/**
 * STEP 13's real, PGlite-backed proof of GATE 13's "attribution joins
 * click to signup end to end" claim. `apps/web` has had no
 * DB-integration test harness since STEP 9 (getAdminDb() needs a real
 * network Postgres) — this file is the first to close that gap, for
 * this module specifically, by typing createShortLink/recordClick/
 * recordAttributionEvent against the same generic PgDatabase base
 * apps/worker's step-ledger.ts/quota.ts already use (see
 * analytics-service.ts's own AnalyticsDb doc comment), so the exact
 * production code runs here against a real embedded Postgres.
 *
 * `// @vitest-environment node` overrides this package's default jsdom
 * environment (apps/web/vitest.config.ts) for just this file — PGlite's
 * WASM+fs bindings need a real Node environment, not a browser-shimmed
 * one, and there's no DOM interaction here to justify jsdom anyway.
 */
describe("analytics-service — website attribution (real embedded Postgres)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "WS", workspaceType: "business" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  it("GATE 13: joins click -> signup -> conversion end to end through one short link", async () => {
    const { slug } = await createShortLink(testDb.admin, { workspaceId, publicationId: null, destinationUrl: "https://demo-biz.example.com/offer" });

    const clicked = await recordClick(testDb.admin, slug);
    expect(clicked).not.toBeNull();
    expect(clicked!.destinationUrl).toBe("https://demo-biz.example.com/offer");

    const signupRecorded = await recordAttributionEvent(testDb.admin, clicked!.clickEventId, "signup", "user-42");
    expect(signupRecorded).toBe(true);
    const conversionRecorded = await recordAttributionEvent(testDb.admin, clicked!.clickEventId, "conversion", "order-99");
    expect(conversionRecorded).toBe(true);

    // The actual join: read back every event for this link's funnel by
    // linkShortId — click, signup, and conversion should all resolve to
    // the SAME link, in order, each carrying the right external ref.
    const linkRows = await testDb.admin.select().from(schema.linkShorts).where(eq(schema.linkShorts.slug, slug));
    const linkShortId = linkRows[0]!.id;
    const events = await testDb.admin.select().from(schema.attributionEvents).where(eq(schema.attributionEvents.linkShortId, linkShortId));

    expect(events).toHaveLength(3);
    const byType = new Map(events.map((e) => [e.eventType, e]));
    expect(byType.get("click")).toBeDefined();
    expect(byType.get("signup")?.externalRef).toBe("user-42");
    expect(byType.get("conversion")?.externalRef).toBe("order-99");
    // Both post-click events carry the click's own id in metadata — the real 1:1 correlation, not just the aggregate link-level join.
    expect((byType.get("signup")?.metadata as { clickEventId: string } | null)?.clickEventId).toBe(clicked!.clickEventId);
  });

  it("returns null for an unknown slug rather than throwing", async () => {
    expect(await recordClick(testDb.admin, "does-not-exist")).toBeNull();
  });

  it("returns false for an unknown vclid rather than throwing", async () => {
    expect(await recordAttributionEvent(testDb.admin, randomUUID(), "signup", null)).toBe(false);
  });

  it("retries with a fresh slug on a real collision, rather than failing the whole request", async () => {
    const { analytics } = await import("@velocity/core");
    const fixedSlug = "collide1";
    await createShortLink(testDb.admin, { workspaceId, publicationId: null, destinationUrl: "https://a.example.com" }, () => fixedSlug);

    // A genuine collision: this generator returns the SAME already-taken slug first, then a real random one — proving the retry loop actually re-calls the generator and succeeds on the second attempt, not just that a fresh slug happens not to collide.
    let calls = 0;
    const collidingThenRealGenerator = () => {
      calls += 1;
      return calls === 1 ? fixedSlug : analytics.generateSlug();
    };
    const second = await createShortLink(testDb.admin, { workspaceId, publicationId: null, destinationUrl: "https://b.example.com" }, collidingThenRealGenerator);
    expect(second.slug).not.toBe(fixedSlug);
    expect(calls).toBe(2);
  });

  describe("getCostPerPublishedPost — STEP 21's literal 'cost per published post' metric", () => {
    async function seedPublishedPostWithRenders(costsUsd: number[]) {
      const brandProfileId = randomUUID();
      const angleId = randomUUID();
      const textPlanId = randomUUID();
      const contentConceptId = randomUUID();
      const contentItemId = randomUUID();
      const socialAccountId = randomUUID();
      const publicationId = randomUUID();

      await testDb.admin.insert(schema.brandProfiles).values({ id: brandProfileId, workspaceId, version: 1, product: "P", category: "c", sourceUrl: "https://example.com" });
      await testDb.admin.insert(schema.angles).values({ id: angleId, workspaceId, brandProfileId, kind: "pain_led", description: "d" });
      await testDb.admin.insert(schema.textPlans).values({ id: textPlanId, workspaceId, version: "1.0", plan: {} });
      await testDb.admin.insert(schema.contentConcepts).values({ id: contentConceptId, workspaceId, angleId, format: "meme", hook: "h", textPlanId });
      await testDb.admin.insert(schema.contentItems).values({ id: contentItemId, workspaceId, contentConceptId, textPlanId, status: "published" });
      await testDb.admin.insert(schema.socialAccounts).values({ id: socialAccountId, workspaceId, platform: "tiktok", externalAccountId: `ext-${socialAccountId}` });
      await testDb.admin.insert(schema.publications).values({ id: publicationId, workspaceId, contentItemId, socialAccountId, idempotencyKey: `${contentItemId}:${socialAccountId}`, status: "published", platformPostId: "post-1" });

      // One row per real render tied to this content item — e.g. a
      // regeneration round — proving the real total (not just the
      // winning render's own cost) is what gets summed.
      for (const costUsd of costsUsd) {
        await testDb.admin.insert(schema.renders).values({ id: randomUUID(), workspaceId, contentItemId, providerId: "kling-3.0", modelId: "kling-3.0", promptHash: "hash1", costUsd: costUsd.toFixed(4) });
      }
      return { contentItemId, publicationId };
    }

    it("returns null cost-per-post with zero totals when there are no published posts yet", async () => {
      const emptyWorkspaceId = randomUUID();
      const orgId = randomUUID();
      await testDb.admin.insert(schema.organisations).values({ id: orgId, name: "Empty Org" });
      await testDb.admin.insert(schema.workspaces).values({ id: emptyWorkspaceId, organisationId: orgId, name: "Empty WS", workspaceType: "business" });

      const result = await getCostPerPublishedPost(testDb.admin, emptyWorkspaceId);
      expect(result).toEqual({ totalCostUsd: 0, publishedPostCount: 0, costPerPostUsd: null });
    });

    it("sums every render tied to a single published post, including regeneration rounds", async () => {
      await seedPublishedPostWithRenders([0.6, 0.6]); // two render attempts for the same published post

      const result = await getCostPerPublishedPost(testDb.admin, workspaceId);
      expect(result.publishedPostCount).toBe(1);
      expect(result.totalCostUsd).toBeCloseTo(1.2, 4);
      expect(result.costPerPostUsd).toBeCloseTo(1.2, 4);
    });

    it("averages correctly across multiple published posts with different real costs", async () => {
      await seedPublishedPostWithRenders([2.0]);
      await seedPublishedPostWithRenders([4.0]);

      const result = await getCostPerPublishedPost(testDb.admin, workspaceId);
      // 1 (from the previous test) + 2 new = 3 published posts this run; total cost 1.2 + 2.0 + 4.0 = 7.2
      expect(result.publishedPostCount).toBe(3);
      expect(result.totalCostUsd).toBeCloseTo(7.2, 4);
      expect(result.costPerPostUsd).toBeCloseTo(2.4, 4);
    });
  });
});
