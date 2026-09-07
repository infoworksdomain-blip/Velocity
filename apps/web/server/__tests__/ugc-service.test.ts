// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkPersonaPolicyForGeneration,
  computeIdentityConsistencyReportForPersona,
  createConsentArtefact,
  createPersona,
  createUgcConceptAndStoryboard,
  requestModerationReview,
  resolveModerationReview,
  selectUsableClipForWorkspace,
} from "../ugc-service";

/**
 * GATE 15's three literal claims, proven against a real embedded Postgres
 * (PGlite) rather than asserted:
 *  1. "Identity consistency measured across 20 renders of one persona."
 *  2. "Attempting to generate a real named public figure is refused."
 *  3. "Every library clip resolves to a licence record."
 * Plus the consent-gate and moderation-review-unlock mechanics that back
 * claim 2's "refused unless a human review approves the regulated claim"
 * behaviour, and the batch-generation concept/storyboard write path.
 */
describe("UGC service (STEP 15 / GATE 15)", () => {
  let testDb: PgliteTestDb;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let userId: string;
  let brandProfileId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    const organisationId = randomUUID();
    workspaceId = randomUUID();
    otherWorkspaceId = randomUUID();
    userId = randomUUID();
    brandProfileId = randomUUID();

    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values([
      { id: workspaceId, organisationId, name: "Workspace", workspaceType: "business" },
      { id: otherWorkspaceId, organisationId, name: "Other Workspace", workspaceType: "business" },
    ]);
    await testDb.admin.insert(schema.users).values({ id: userId, email: "reviewer@example.com" });
    await testDb.admin.insert(schema.brandProfiles).values({ id: brandProfileId, workspaceId, version: 1, product: "P", category: "c", sourceUrl: "https://example.com" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  describe("consent gate", () => {
    it("blocks generation for a persona that models a real person with no consent artefact", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Real Persona", modelsRealPerson: true });
      const result = await checkPersonaPolicyForGeneration(testDb.admin, { workspaceId, personaId, script: "A totally clean, generic script." });
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toBe("consent_missing");
    });

    it("allows generation for a persona with a real, non-expired consent artefact", async () => {
      const { id: artefactId } = await createConsentArtefact(testDb.admin, { workspaceId, subjectName: "Jane Model", documentStorageKey: "releases/jane.pdf", signedAt: new Date("2026-01-01") });
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Consented Persona", modelsRealPerson: true, consentArtefactId: artefactId });
      const result = await checkPersonaPolicyForGeneration(testDb.admin, { workspaceId, personaId, script: "A totally clean, generic script." });
      expect(result.allowed).toBe(true);
    });

    it("rejects creating a persona with a consent artefact id from another workspace", async () => {
      const { id: otherArtefactId } = await createConsentArtefact(testDb.admin, { workspaceId: otherWorkspaceId, subjectName: "Other Model", documentStorageKey: "releases/other.pdf", signedAt: new Date("2026-01-01") });
      await expect(createPersona(testDb.admin, { workspaceId, name: "Cross-tenant attempt", modelsRealPerson: true, consentArtefactId: otherArtefactId })).rejects.toThrow();
    });
  });

  describe("GATE 15 claim: attempting to generate a real named public figure is refused", () => {
    it("refuses a script naming a real public figure, even for a synthetic (non-real-person) persona", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Synthetic Persona", modelsRealPerson: false });
      const result = await checkPersonaPolicyForGeneration(testDb.admin, { workspaceId, personaId, script: "In this video, Elon Musk explains why our product is the best." });
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toBe("public_figure");
      expect(result.message).toContain("Elon Musk");
    });

    it("is not overridable by an approved moderation review — a public-figure block is refused, not reviewable", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Synthetic Persona 2", modelsRealPerson: false });
      const script = "Watch Taylor Swift try our new skincare routine.";
      const { id: reviewId } = await requestModerationReview(testDb.admin, { workspaceId, targetType: "persona_script", targetId: `${personaId}:${script}` });
      await resolveModerationReview(testDb.admin, { workspaceId, reviewId, reviewerUserId: userId, decision: "approved" });

      const result = await checkPersonaPolicyForGeneration(testDb.admin, { workspaceId, personaId, script });
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toBe("public_figure");
    });
  });

  describe("regulated-claim moderation review flow (the first real reader/writer of moderation_reviews)", () => {
    it("blocks a regulated-claim script until a platform moderator approves a review for that exact script", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Claims Persona", modelsRealPerson: false });
      const script = "This product guarantees weight loss and cures disease fast.";

      const before = await checkPersonaPolicyForGeneration(testDb.admin, { workspaceId, personaId, script });
      expect(before.allowed).toBe(false);
      expect(before.blockReason).toBe("regulated_claim");

      const { id: reviewId } = await requestModerationReview(testDb.admin, { workspaceId, targetType: "persona_script", targetId: `${personaId}:${script}` });
      await resolveModerationReview(testDb.admin, { workspaceId, reviewId, reviewerUserId: userId, decision: "approved", notes: "Reviewed against ASA guidance, approved for this campaign." });

      const after = await checkPersonaPolicyForGeneration(testDb.admin, { workspaceId, personaId, script });
      expect(after.allowed).toBe(true);
    });

    it("a rejected review keeps the script blocked", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Claims Persona 2", modelsRealPerson: false });
      const script = "Guaranteed returns on your investment, risk-free.";

      const { id: reviewId } = await requestModerationReview(testDb.admin, { workspaceId, targetType: "persona_script", targetId: `${personaId}:${script}` });
      await resolveModerationReview(testDb.admin, { workspaceId, reviewId, reviewerUserId: userId, decision: "rejected" });

      const result = await checkPersonaPolicyForGeneration(testDb.admin, { workspaceId, personaId, script });
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toBe("regulated_claim");
    });

    it("rejects resolving a review id that belongs to a different workspace", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId: otherWorkspaceId, name: "Other WS Persona", modelsRealPerson: false });
      const { id: reviewId } = await requestModerationReview(testDb.admin, { workspaceId: otherWorkspaceId, targetType: "persona_script", targetId: `${personaId}:x` });
      await expect(resolveModerationReview(testDb.admin, { workspaceId, reviewId, reviewerUserId: userId, decision: "approved" })).rejects.toThrow();
    });
  });

  describe("GATE 15 claim: every library clip resolves to a licence record", () => {
    it("selects the clip whose licence covers the requested territory and media", async () => {
      await testDb.admin.insert(schema.ugcClips).values([
        { id: randomUUID(), workspaceId, storageKey: "clips/a.mp4", releaseRef: "release-a", usageTerritory: "Nigeria", usageMedia: ["organic"] },
        { id: randomUUID(), workspaceId, storageKey: "clips/b.mp4", releaseRef: "release-b", usageTerritory: "UK", usageMedia: ["paid_social", "organic"] },
      ]);

      const selected = await selectUsableClipForWorkspace(testDb.admin, { workspaceId, territory: "UK", media: "paid_social" });
      expect(selected).not.toBeNull();
      expect(selected!.releaseRef).toBe("release-b");
    });

    it("returns null (never an unlicensed clip) when no clip's licence covers the requested context", async () => {
      const selected = await selectUsableClipForWorkspace(testDb.admin, { workspaceId, territory: "Kenya", media: "paid_social" });
      expect(selected).toBeNull();
    });

    it("never returns a clip from a different workspace's library, even one with no usage restrictions at all", async () => {
      await testDb.admin.insert(schema.ugcClips).values({ id: randomUUID(), workspaceId: otherWorkspaceId, storageKey: "clips/c.mp4", releaseRef: "release-c", usageTerritory: null, usageMedia: [] });
      // clip-c (unrestricted) WOULD match "Anywhere"/"organic" if the workspace scope leaked; workspace's own two clips (Nigeria-only, UK-only) do not — proves the query is workspace-scoped, not a licence-logic coincidence.
      const selected = await selectUsableClipForWorkspace(testDb.admin, { workspaceId, territory: "Anywhere", media: "organic" });
      expect(selected).toBeNull();
    });
  });

  describe("GATE 15 claim: identity consistency measured across 20 renders of one persona", () => {
    it("aggregates real phash values recorded on this persona's actual renders", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Render Persona", modelsRealPerson: false });
      const { contentConceptId } = await createUgcConceptAndStoryboard(testDb.admin, { workspaceId, brandProfileId, personaId, script: "A UGC script for render seeding." });

      const referencePhash = "0f0f0f0f0f0f0f0f";
      const consistentPhash = "0f0f0f0f0f0f0f0e"; // 1 bit off — well within threshold
      const inconsistentPhash = "f0f0f0f0f0f0f0f0"; // fully inverted — well beyond threshold

      const textPlanId = randomUUID();
      await testDb.admin.insert(schema.textPlans).values({ id: textPlanId, workspaceId, version: "1.0", plan: {} });

      for (let i = 0; i < 20; i++) {
        const contentItemId = randomUUID();
        const renderId = randomUUID();
        await testDb.admin.insert(schema.contentItems).values({ id: contentItemId, workspaceId, contentConceptId, textPlanId, status: "ready" });
        await testDb.admin.insert(schema.renders).values({
          id: renderId,
          workspaceId,
          contentItemId,
          providerId: "stub-video-provider",
          modelId: "stub-v1",
          promptHash: `prompt-${i}`,
          phash: i < 15 ? consistentPhash : inconsistentPhash,
        });
      }

      const report = await computeIdentityConsistencyReportForPersona(testDb.admin, workspaceId, personaId, referencePhash);
      expect(report.perRender).toHaveLength(20);
      expect(report.consistencyRate).toBeCloseTo(15 / 20, 5);
    });
  });

  describe("createUgcConceptAndStoryboard", () => {
    it("rejects a brandProfileId that does not belong to the calling workspace", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Scoped Persona", modelsRealPerson: false });
      const otherBrandProfileId = randomUUID();
      await testDb.admin.insert(schema.brandProfiles).values({ id: otherBrandProfileId, workspaceId: otherWorkspaceId, version: 1, product: "P2", category: "c", sourceUrl: "https://example.com" });

      await expect(createUgcConceptAndStoryboard(testDb.admin, { workspaceId, brandProfileId: otherBrandProfileId, personaId, script: "x" })).rejects.toThrow();
    });

    it("creates a content_concepts + storyboards row pair using the same 'UGC' angle across repeated calls", async () => {
      const { id: personaId } = await createPersona(testDb.admin, { workspaceId, name: "Angle Reuse Persona", modelsRealPerson: false });
      const first = await createUgcConceptAndStoryboard(testDb.admin, { workspaceId, brandProfileId, personaId, script: "First script." });
      const second = await createUgcConceptAndStoryboard(testDb.admin, { workspaceId, brandProfileId, personaId, script: "Second script." });

      const concepts = await testDb.admin
        .select()
        .from(schema.contentConcepts)
        .where(inArray(schema.contentConcepts.id, [first.contentConceptId, second.contentConceptId]));
      expect(concepts).toHaveLength(2);
      expect(concepts[0]!.angleId).toBe(concepts[1]!.angleId);
      expect(concepts.every((c) => c.format === "ai_ugc")).toBe(true);
    });
  });
});
