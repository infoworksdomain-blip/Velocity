// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAutomation, runAutomation } from "../automation-service";

/**
 * The Automation Engine's I/O half (STEP 16), proven against a real
 * embedded Postgres (PGlite). `generate_batch`/`regenerate_hooks_for_
 * underperformers` are NOT covered here end-to-end — both call
 * content-service.ts's `generateConceptsForWorkspace`, which (like STEP
 * 14 already documented for `create_content_concepts`) still resolves
 * its own `getAdminDb()` internally rather than accepting an injectable
 * `db`, so it cannot run against this test's PGlite instance. This is
 * the SAME pre-existing, already-flagged gap, not a new one this step
 * introduces — see docs/steps/STEP-16.md.
 */
describe("Automation Engine (STEP 16)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    userId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Workspace", workspaceType: "business", timezone: "UTC" });
    await testDb.admin.insert(schema.users).values({ id: userId, email: "user@example.com" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  it("skips (does not act) when the trigger does not fire, and records a real automation_runs row saying so", async () => {
    const { id: automationId } = await createAutomation(
      // minReadyCount: 0 means the trigger never fires (0 ready items >= 0 is always true — the queue is never "below" a zero minimum).
      { workspaceId, name: "Low queue alert", trigger: { kind: "low_queue", config: { minReadyCount: 0 } }, action: { kind: "notify", config: { userId, title: "t", body: "b" } }, spendCapUsd: null, isDryRun: false },
      testDb.admin,
    );

    const result = await runAutomation(workspaceId, automationId, testDb.admin);
    expect(result.fired).toBe(false);
    expect(result.status).toBe("skipped");

    const runs = await testDb.admin.select().from(schema.automationRuns).where(eq(schema.automationRuns.automationId, automationId));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("skipped");
  });

  it("fires the low_queue trigger and executes a real notify action, writing a real persisted notification", async () => {
    const { id: automationId } = await createAutomation(
      { workspaceId, name: "Queue running low", trigger: { kind: "low_queue", config: { minReadyCount: 1000 } }, action: { kind: "notify", config: { userId, title: "Queue is low", body: "Only a few items left" } }, spendCapUsd: null, isDryRun: false },
      testDb.admin,
    );

    // low_queue fires because readyCount (0, nothing seeded) < minReadyCount (1000) — no content_items needed for this specific case.
    const result = await runAutomation(workspaceId, automationId, testDb.admin);
    expect(result.fired).toBe(true);
    expect(result.status).toBe("succeeded");

    // The notify action publishes through the in-process bus; persistence only happens once ensureNotificationPersistence() has wired a subscriber, which executeAction calls defensively — verify a real row landed.
    const notificationRows = await testDb.admin.select().from(schema.notifications).where(eq(schema.notifications.workspaceId, workspaceId));
    const match = notificationRows.find((n) => n.title === "Queue is low");
    expect(match).toBeDefined();
    expect(match!.userId).toBe(userId);
  });

  it("dry-run mode never executes the action's real effect, only describes it", async () => {
    const { id: automationId } = await createAutomation(
      { workspaceId, name: "Dry run notify", trigger: { kind: "low_queue", config: { minReadyCount: 1000 } }, action: { kind: "notify", config: { userId, title: "SHOULD NOT PERSIST", body: "b" } }, spendCapUsd: null, isDryRun: true },
      testDb.admin,
    );

    const result = await runAutomation(workspaceId, automationId, testDb.admin);
    expect(result.fired).toBe(true);
    expect(result.resultSummary).toMatchObject({ dryRun: true });

    const notificationRows = await testDb.admin.select().from(schema.notifications).where(eq(schema.notifications.workspaceId, workspaceId));
    expect(notificationRows.find((n) => n.title === "SHOULD NOT PERSIST")).toBeUndefined();
  });

  it("executes a real pause_campaign action, setting campaigns.pausedAt", async () => {
    const campaignId = randomUUID();
    await testDb.admin.insert(schema.campaigns).values({ id: campaignId, workspaceId, name: "Summer campaign" });

    const { id: automationId } = await createAutomation(
      { workspaceId, name: "Pause on low queue", trigger: { kind: "low_queue", config: { minReadyCount: 1000 } }, action: { kind: "pause_campaign", config: { campaignId } }, spendCapUsd: null, isDryRun: false },
      testDb.admin,
    );

    const result = await runAutomation(workspaceId, automationId, testDb.admin);
    expect(result.status).toBe("succeeded");

    const campaignRows = await testDb.admin.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    expect(campaignRows[0]!.pausedAt).not.toBeNull();
  });

  it("refuses to pause a campaign belonging to a different workspace", async () => {
    const otherWorkspaceId = randomUUID();
    const otherOrgId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: otherOrgId, name: "Other Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: otherWorkspaceId, organisationId: otherOrgId, name: "Other Workspace", workspaceType: "business" });
    const otherCampaignId = randomUUID();
    await testDb.admin.insert(schema.campaigns).values({ id: otherCampaignId, workspaceId: otherWorkspaceId, name: "Not yours" });

    const { id: automationId } = await createAutomation(
      { workspaceId, name: "Cross-tenant pause attempt", trigger: { kind: "low_queue", config: { minReadyCount: 1000 } }, action: { kind: "pause_campaign", config: { campaignId: otherCampaignId } }, spendCapUsd: null, isDryRun: false },
      testDb.admin,
    );

    const result = await runAutomation(workspaceId, automationId, testDb.admin);
    expect(result.status).toBe("failed");

    const campaignRows = await testDb.admin.select().from(schema.campaigns).where(eq(schema.campaigns.id, otherCampaignId));
    expect(campaignRows[0]!.pausedAt).toBeNull();
  });

  it("blocks a run once the automation's own past spend already exceeds its spend cap, without executing the action", async () => {
    const campaignId = randomUUID();
    await testDb.admin.insert(schema.campaigns).values({ id: campaignId, workspaceId, name: "Capped campaign" });

    const { id: automationId } = await createAutomation(
      { workspaceId, name: "Capped automation", trigger: { kind: "low_queue", config: { minReadyCount: 1000 } }, action: { kind: "pause_campaign", config: { campaignId } }, spendCapUsd: 5, isDryRun: false },
      testDb.admin,
    );

    // Seed a real prior run whose recorded cost already exceeds the $5 cap.
    await testDb.admin.insert(schema.automationRuns).values({ id: randomUUID(), workspaceId, automationId, status: "succeeded", startedAt: new Date(), finishedAt: new Date(), resultSummary: { costUsd: 12 } });

    const result = await runAutomation(workspaceId, automationId, testDb.admin);
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("cap");

    const campaignRows = await testDb.admin.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
    expect(campaignRows[0]!.pausedAt).toBeNull();
  });

  it("boost_winner_variants applies real z-score-derived velocity_preferences boosts from seeded performance data", async () => {
    const brandProfileId = randomUUID();
    const angleId = randomUUID();
    await testDb.admin.insert(schema.brandProfiles).values({ id: brandProfileId, workspaceId, version: 1, product: "P", category: "c", sourceUrl: "https://example.com" });
    await testDb.admin.insert(schema.angles).values({ id: angleId, workspaceId, brandProfileId, kind: "pain_led", description: "d" });

    // engagementRate is (likes+comments+shares)/max(views,1) — views is held
    // constant across every post so only the engagement counts (the actual
    // driver of the ratio) differ between the low performers and the winner.
    async function seedPublishedPost(likes: number, hookPattern: string) {
      const textPlanId = randomUUID();
      const contentConceptId = randomUUID();
      const contentItemId = randomUUID();
      const socialAccountId = randomUUID();
      const publicationId = randomUUID();
      await testDb.admin.insert(schema.textPlans).values({ id: textPlanId, workspaceId, version: "1.0", plan: {} });
      await testDb.admin.insert(schema.contentConcepts).values({ id: contentConceptId, workspaceId, angleId, format: "meme", hook: "h", hookPattern, textPlanId });
      await testDb.admin.insert(schema.contentItems).values({ id: contentItemId, workspaceId, contentConceptId, textPlanId, status: "published" });
      await testDb.admin.insert(schema.socialAccounts).values({ id: socialAccountId, workspaceId, platform: "tiktok", externalAccountId: `ext-${socialAccountId}` });
      await testDb.admin.insert(schema.publications).values({ id: publicationId, workspaceId, contentItemId, socialAccountId, idempotencyKey: `${contentItemId}:${socialAccountId}`, status: "published", platformPostId: "post-1" });
      await testDb.admin.insert(schema.metricSnapshots).values({ id: randomUUID(), workspaceId, publicationId, capturedAt: new Date(), views: 1000, likes, comments: 0, shares: 0 });
    }

    // 4 near-identical low performers (a ~1% engagement rate) + 1 clear winner (a 50% engagement rate) — a real, unambiguous statistical outlier.
    await seedPublishedPost(10, "curiosity_gap");
    await seedPublishedPost(11, "curiosity_gap");
    await seedPublishedPost(9, "curiosity_gap");
    await seedPublishedPost(10, "curiosity_gap");
    await seedPublishedPost(500, "pattern_interrupt");

    const { id: automationId } = await createAutomation(
      { workspaceId, name: "Boost winners weekly", trigger: { kind: "low_queue", config: { minReadyCount: 1000 } }, action: { kind: "boost_winner_variants", config: { winnerZScoreThreshold: 1.5 } }, spendCapUsd: null, isDryRun: false },
      testDb.admin,
    );

    const result = await runAutomation(workspaceId, automationId, testDb.admin);
    expect(result.status).toBe("succeeded");
    expect((result.resultSummary as { dimensionsBoosted: number }).dimensionsBoosted).toBeGreaterThan(0);

    const preferenceRows = await testDb.admin.select().from(schema.velocityPreferences).where(eq(schema.velocityPreferences.workspaceId, workspaceId));
    const hookPatternPref = preferenceRows.find((p) => p.dimensionKey === "hook_pattern:pattern_interrupt");
    expect(hookPatternPref).toBeDefined();
    expect(hookPatternPref!.alpha).toBeGreaterThan(1); // boosted above the uniform Beta(1,1) prior
  });
});
