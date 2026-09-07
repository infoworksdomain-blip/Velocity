import { randomUUID } from "node:crypto";
import { schema, LocalDevKmsProvider } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runMetricsIngestionTick } from "../jobs/metrics-ingestion.js";

const KMS_KEY = "a".repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("runMetricsIngestionTick — against a real embedded Postgres (PGlite)", () => {
  let testDb: PgliteTestDb;
  let kms: LocalDevKmsProvider;
  let workspaceId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();
    kms = new LocalDevKmsProvider(KMS_KEY);

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "WS", workspaceType: "business" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const seededPublicationIds: string[] = [];
  afterEach(async () => {
    for (const id of seededPublicationIds) {
      await testDb.admin.update(schema.socialAccounts).set({ connectionStatus: "disconnected" }).where(eq(schema.socialAccounts.id, id));
    }
    seededPublicationIds.length = 0;
  });

  async function seedPublishedPost(platform: "tiktok" | "instagram" | "youtube", platformPostId: string, resourceId: string | null = null) {
    const brandProfileId = randomUUID();
    const angleId = randomUUID();
    const textPlanId = randomUUID();
    const contentConceptId = randomUUID();
    const contentItemId = randomUUID();
    const socialAccountId = randomUUID();
    const publicationId = randomUUID();

    await testDb.admin.insert(schema.brandProfiles).values({ id: brandProfileId, workspaceId, version: 1, product: "TaskFlow", category: "productivity", sourceUrl: "https://taskflow.example.com" });
    await testDb.admin.insert(schema.angles).values({ id: angleId, workspaceId, brandProfileId, kind: "pain_led", description: "d" });
    await testDb.admin.insert(schema.textPlans).values({ id: textPlanId, workspaceId, version: "1.0", plan: {} });
    await testDb.admin.insert(schema.contentConcepts).values({ id: contentConceptId, workspaceId, angleId, format: "meme", hook: "h", textPlanId });
    await testDb.admin.insert(schema.contentItems).values({ id: contentItemId, workspaceId, contentConceptId, textPlanId, status: "published" });
    await testDb.admin.insert(schema.socialAccounts).values({ id: socialAccountId, workspaceId, platform, externalAccountId: `ext-${socialAccountId}`, connectionStatus: "connected" });
    seededPublicationIds.push(socialAccountId);

    const { ciphertext, keyId } = await kms.encrypt(JSON.stringify({ accessToken: "at-1", refreshMaterial: "rt-1", resourceId }));
    await testDb.admin.insert(schema.platformCredentials).values({ id: randomUUID(), workspaceId, socialAccountId, encryptedPayload: ciphertext, kmsKeyId: keyId });
    await testDb.admin.insert(schema.publications).values({ id: publicationId, workspaceId, contentItemId, socialAccountId, idempotencyKey: `${contentItemId}:${socialAccountId}`, status: "published", platformPostId });

    return { publicationId, socialAccountId };
  }

  it("ingests real TikTok metrics into a new metric_snapshots row", async () => {
    const { publicationId } = await seedPublishedPost("tiktok", "tt-video-1");
    const now = new Date("2026-06-01T12:00:00Z");

    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/v2/video/query/");
      return jsonResponse({ data: { videos: [{ id: "tt-video-1", view_count: 5000, like_count: 300, comment_count: 20, share_count: 10 }] }, error: { code: "ok", message: "", log_id: "1" } });
    });

    const result = await runMetricsIngestionTick({ db: testDb.admin, kms, fetchImpl: fetchImpl as unknown as typeof fetch, now });
    expect(result.ingestedPublicationIds).toEqual([publicationId]);

    const snapshots = await testDb.admin.select().from(schema.metricSnapshots).where(eq(schema.metricSnapshots.publicationId, publicationId));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.views).toBe(5000);
    expect(snapshots[0]?.likes).toBe(300);
  });

  it("ingests real Instagram insights, mapping plays -> views", async () => {
    const { publicationId } = await seedPublishedPost("instagram", "ig-media-1", "ig-business-1");
    const now = new Date("2026-06-02T12:00:00Z");

    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ name: "plays", values: [{ value: 800 }] }, { name: "likes", values: [{ value: 60 }] }] }));

    const result = await runMetricsIngestionTick({ db: testDb.admin, kms, fetchImpl: fetchImpl as unknown as typeof fetch, now });
    expect(result.ingestedPublicationIds).toEqual([publicationId]);

    const snapshots = await testDb.admin.select().from(schema.metricSnapshots).where(eq(schema.metricSnapshots.publicationId, publicationId));
    expect(snapshots[0]?.views).toBe(800);
    expect(snapshots[0]?.likes).toBe(60);
  });

  it("respects the metrics_read quota — skips an account whose window is exhausted, with no fetch call", async () => {
    const { socialAccountId } = await seedPublishedPost("youtube", "yt-video-1");
    const now = new Date("2026-06-03T12:00:00Z");

    // Exhaust this account's metrics_read window first, via the same tick logic (cap=20 default) — simulate by directly running the quota check up to cap.
    const { social } = await import("@velocity/core");
    for (let i = 0; i < 20; i++) {
      await social.checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId, requestKind: "metrics_read", windowSeconds: 3600, requestCap: 20, now });
    }

    const fetchImpl = vi.fn();
    const result = await runMetricsIngestionTick({ db: testDb.admin, kms, fetchImpl: fetchImpl as unknown as typeof fetch, now, windowSeconds: 3600, requestCap: 20 });

    expect(result.quotaSkippedAccounts).toContain(socialAccountId);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not let metrics_read quota consumption touch the account's separate publish quota", async () => {
    const { socialAccountId } = await seedPublishedPost("tiktok", "tt-video-2");
    const now = new Date("2026-06-04T12:00:00Z");

    const fetchImpl = vi.fn(async () => jsonResponse({ data: { videos: [{ id: "tt-video-2", view_count: 1 }] }, error: { code: "ok", message: "", log_id: "1" } }));
    await runMetricsIngestionTick({ db: testDb.admin, kms, fetchImpl: fetchImpl as unknown as typeof fetch, now });

    const { social } = await import("@velocity/core");
    const publishQuota = await social.checkAndIncrementQuota(testDb.admin, { workspaceId, socialAccountId, requestKind: "publish", windowSeconds: 86400, requestCap: 15, now });
    expect(publishQuota.allowed).toBe(true);
    expect(publishQuota.requestCount).toBe(1); // untouched by the metrics_read call above — a fresh counter
  });
});
