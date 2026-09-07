import { randomUUID } from "node:crypto";
import { schema, LocalDevKmsProvider } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import type { Platform, PublishWorkflowInput } from "@velocity/contracts";

/**
 * Builds the real FK chain a publish workflow needs: a completed,
 * QC-passed, human-approved render (mirroring what STEP 8's render
 * workflow itself would have produced) plus a connected social account
 * with real encrypted platform_credentials — all real inserts against
 * PGlite, same discipline as buildRenderFixture.
 */
export async function buildPublishFixture(
  testDb: PgliteTestDb,
  kms: LocalDevKmsProvider,
  overrides: { platform?: Platform; durationMs?: number; qcPassed?: boolean; connectionStatus?: "connected" | "reauth_required" | "disconnected"; resourceId?: string | null } = {},
): Promise<{ input: PublishWorkflowInput; renderOutputKey: string }> {
  const organisationId = randomUUID();
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const brandProfileId = randomUUID();
  const angleId = randomUUID();
  const textPlanId = randomUUID();
  const contentConceptId = randomUUID();
  const contentItemId = randomUUID();
  const renderId = randomUUID();
  const socialAccountId = randomUUID();
  const publicationId = randomUUID();
  const platform: Platform = overrides.platform ?? "tiktok";
  const renderOutputKey = `renders/${renderId}/output.mp4`;

  await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Fixture Org" });
  await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Fixture Workspace", workspaceType: "business" });
  await testDb.admin.insert(schema.users).values({ id: userId, email: `owner-${userId}@example.com` });
  await testDb.admin.insert(schema.roles).values({ id: roleId, scope: "workspace", key: "owner", name: "Owner", permissions: [] });
  await testDb.admin.insert(schema.memberships).values({ workspaceId, userId, roleId });

  await testDb.admin.insert(schema.brandProfiles).values({ id: brandProfileId, workspaceId, version: 1, product: "TaskFlow", category: "productivity software", sourceUrl: "https://taskflow.example.com" });
  await testDb.admin.insert(schema.angles).values({ id: angleId, workspaceId, brandProfileId, kind: "pain_led", description: "Solving disorganisation" });
  await testDb.admin.insert(schema.textPlans).values({ id: textPlanId, workspaceId, version: "1.0", plan: { placeholder: true } });
  await testDb.admin.insert(schema.contentConcepts).values({ id: contentConceptId, workspaceId, angleId, format: "meme", hook: "Why nobody talks about staying organised", textPlanId, predictedScore: "0.5" });
  await testDb.admin.insert(schema.contentItems).values({
    id: contentItemId,
    workspaceId,
    contentConceptId,
    textPlanId,
    status: "ready",
    approvedByUserId: userId,
    approvedAt: new Date("2026-06-01T00:00:00Z"),
  });
  await testDb.admin.insert(schema.renders).values({
    id: renderId,
    workspaceId,
    contentItemId,
    status: "succeeded",
    providerId: "stub",
    modelId: "stub-model",
    promptHash: "hash-1",
    outputStorageKey: renderOutputKey,
    qcPassed: overrides.qcPassed ?? true,
    durationMs: overrides.durationMs ?? 20000,
    aiGenerated: true,
    c2paSigned: false, // real, honest default — STEP 8 documented this as unset in this sandbox (no production signing cert)
  });

  await testDb.admin.insert(schema.socialAccounts).values({ id: socialAccountId, workspaceId, platform, externalAccountId: `ext-${socialAccountId}`, connectionStatus: overrides.connectionStatus ?? "connected" });

  const resourceId = overrides.resourceId === undefined ? (platform === "instagram" ? "ig-business-1" : null) : overrides.resourceId;
  const { ciphertext, keyId } = await kms.encrypt(JSON.stringify({ accessToken: "at-1", refreshMaterial: "rt-1", resourceId }));
  await testDb.admin.insert(schema.platformCredentials).values({ id: randomUUID(), workspaceId, socialAccountId, encryptedPayload: ciphertext, kmsKeyId: keyId, expiresAt: new Date("2027-01-01T00:00:00Z") });

  const idempotencyKey = `${contentItemId}:${socialAccountId}`;
  await testDb.admin.insert(schema.publications).values({ id: publicationId, workspaceId, contentItemId, socialAccountId, idempotencyKey, status: "pending" });

  return {
    input: { publicationId, workspaceId, contentItemId, renderId, socialAccountId, platform, idempotencyKey, requestedByUserId: userId },
    renderOutputKey,
  };
}
