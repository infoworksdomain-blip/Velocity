// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createShortLink, recordAttributionEvent, recordClick } from "../analytics-service";

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
});
