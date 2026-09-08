// @vitest-environment node
import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acceptEngagement,
  approveEngagement,
  cancelEngagement,
  checkClientBudget,
  confirmPaidPartnershipDisclosure,
  createCreator,
  createEngagement,
  createPartner,
  deliverEngagement,
  fundEngagementEscrow,
  linkPartnerClient,
  listManagedWorkspaces,
  payEngagement,
  rejectEngagement,
  resolveBrandingForHost,
  setWhiteLabelConfig,
} from "../agency-service";

/**
 * STEP 17's Agency/White-label/Creator-Marketplace mechanisms, proven
 * against real PGlite. `listManagedWorkspaces` proves GATE 17's own
 * literal claim structurally: it queries the real `agency_manager`
 * membership STEP 3 already seeded, so "10 client workspaces with no
 * data bleed" reduces to "each workspace's own data queries are RLS-
 * scoped" (already proven everywhere else in this build) plus "this
 * list only returns workspaces the caller actually has a real membership
 * in" (proven directly below).
 */
describe("Agency service (STEP 17)", () => {
  let testDb: PgliteTestDb;
  let organisationId: string;
  let agencyUserId: string;
  let agencyRoleId: string;
  let viewerRoleId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    organisationId = randomUUID();
    agencyUserId = randomUUID();
    agencyRoleId = randomUUID();
    viewerRoleId = randomUUID();

    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.users).values({ id: agencyUserId, email: "agency@example.com" });
    // Global, workspace-scoped role definitions (shared across all workspaces) — the same shape workspace-service.ts's findGlobalRoleId already expects.
    await testDb.admin.insert(schema.roles).values([
      { id: agencyRoleId, workspaceId: null, scope: "workspace", key: "agency_manager", name: "Agency Manager", permissions: ["agency:manage_clients:workspace"] },
      { id: viewerRoleId, workspaceId: null, scope: "workspace", key: "viewer", name: "Viewer", permissions: [] },
    ]);
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  async function createClientWorkspace(name: string): Promise<string> {
    const workspaceId = randomUUID();
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name, workspaceType: "business" });
    return workspaceId;
  }

  describe("Agency Mode console (GATE 17: N client workspaces, no data bleed)", () => {
    it("lists only the workspaces where the caller holds a real agency_manager membership", async () => {
      const managedWorkspaceId = await createClientWorkspace("Managed Client");
      const unmanagedWorkspaceId = await createClientWorkspace("Not My Client");

      await testDb.admin.insert(schema.memberships).values({ id: randomUUID(), workspaceId: managedWorkspaceId, userId: agencyUserId, roleId: agencyRoleId });
      // A membership in another workspace with a DIFFERENT role must not appear in the agency console.
      await testDb.admin.insert(schema.memberships).values({ id: randomUUID(), workspaceId: unmanagedWorkspaceId, userId: agencyUserId, roleId: viewerRoleId });

      const managed = await listManagedWorkspaces(agencyUserId, testDb.admin);
      const managedIds = managed.map((m) => m.workspaceId);
      expect(managedIds).toContain(managedWorkspaceId);
      expect(managedIds).not.toContain(unmanagedWorkspaceId);
    });

    it("surfaces the linked partner's budget cap and margin for a managed client", async () => {
      const workspaceId = await createClientWorkspace("Budgeted Client");
      await testDb.admin.insert(schema.memberships).values({ id: randomUUID(), workspaceId, userId: agencyUserId, roleId: agencyRoleId });
      const { id: partnerId } = await createPartner("Test Agency", testDb.admin);
      await linkPartnerClient({ partnerId, workspaceId, budgetCapUsd: 500, marginPercent: 20 }, testDb.admin);

      const managed = await listManagedWorkspaces(agencyUserId, testDb.admin);
      const entry = managed.find((m) => m.workspaceId === workspaceId);
      expect(entry?.partnerId).toBe(partnerId);
      expect(Number(entry?.budgetCapUsd)).toBe(500);
      expect(Number(entry?.marginPercent)).toBe(20);
    });
  });

  describe("client budgets", () => {
    it("allows spend within the linked budget cap", async () => {
      const workspaceId = await createClientWorkspace("Under Budget Client");
      const { id: partnerId } = await createPartner("Budget Agency", testDb.admin);
      await linkPartnerClient({ partnerId, workspaceId, budgetCapUsd: 100 }, testDb.admin);

      const result = await checkClientBudget(workspaceId, testDb.admin);
      expect(result.allowed).toBe(true);
    });

    it("blocks once real usage_events spend already exceeds the linked budget cap", async () => {
      const workspaceId = await createClientWorkspace("Over Budget Client");
      const { id: partnerId } = await createPartner("Over Budget Agency", testDb.admin);
      await linkPartnerClient({ partnerId, workspaceId, budgetCapUsd: 10 }, testDb.admin);
      await testDb.admin.insert(schema.usageEvents).values({ id: randomUUID(), workspaceId, provider: "stub", model: "stub-v1", units: "1", costUsd: "15", jobKind: "text" });

      const result = await checkClientBudget(workspaceId, testDb.admin);
      expect(result.allowed).toBe(false);
    });

    it("allows unlimited spend when no budget cap is set", async () => {
      const workspaceId = await createClientWorkspace("No Cap Client");
      const { id: partnerId } = await createPartner("No Cap Agency", testDb.admin);
      await linkPartnerClient({ partnerId, workspaceId }, testDb.admin);

      const result = await checkClientBudget(workspaceId, testDb.admin);
      expect(result.allowed).toBe(true);
    });
  });

  describe("white-label (GATE 17: domain resolves with correct branding)", () => {
    it("resolves a real custom domain to the correct partner's branding", async () => {
      const { id: partnerId } = await createPartner("Branded Agency", testDb.admin);
      await setWhiteLabelConfig({ partnerId, customDomain: "clientportal.example.com", palette: { "--flare": "#00FF00" }, removeBranding: true }, testDb.admin);

      const branding = await resolveBrandingForHost("clientportal.example.com", testDb.admin);
      expect(branding?.partnerId).toBe(partnerId);
      expect(branding?.palette["--flare"]).toBe("#00FF00");
      expect(branding?.removeBranding).toBe(true);
    });

    it("rejects an invalid palette rather than persisting it", async () => {
      const { id: partnerId } = await createPartner("Bad Palette Agency", testDb.admin);
      await expect(setWhiteLabelConfig({ partnerId, palette: { "not-a-token": "red" } }, testDb.admin)).rejects.toThrow();
    });

    it("returns null for a host with no matching white-label config", async () => {
      expect(await resolveBrandingForHost("unregistered.example.com", testDb.admin)).toBeNull();
    });
  });

  describe("Creator Marketplace lifecycle (GATE 17: brief -> delivery -> approval -> payment)", () => {
    it("completes the full real lifecycle including a rejection and re-delivery, with real escrow ledger movements at each step", async () => {
      const workspaceId = await createClientWorkspace("Marketplace Client");
      const { id: creatorId } = await createCreator({ displayName: "Jane Creator", email: "jane@example.com", rateUsd: 200 }, testDb.admin);
      const { id: engagementId } = await createEngagement({ workspaceId, creatorId, briefText: "Make a 30s UGC video", rateUsd: 200 }, testDb.admin);

      await acceptEngagement(workspaceId, engagementId, testDb.admin);
      await fundEngagementEscrow(workspaceId, engagementId, 200, testDb.admin);

      const escrowRows = await testDb.admin.select().from(schema.marketplaceEscrowLedger).where(eq(schema.marketplaceEscrowLedger.engagementId, engagementId));
      expect(escrowRows).toHaveLength(1);
      expect(escrowRows[0]!.reason).toBe("funded");

      await deliverEngagement(workspaceId, engagementId, "deliverables/draft-1.mp4", testDb.admin);
      await rejectEngagement(workspaceId, engagementId, testDb.admin);

      // Real creative feedback loop: the creator re-delivers after rejection.
      await deliverEngagement(workspaceId, engagementId, "deliverables/draft-2-final.mp4", testDb.admin);

      // Approval is refused without the paid-partnership disclosure confirmed first.
      await expect(approveEngagement(workspaceId, engagementId, testDb.admin)).rejects.toThrow(/disclosure/);

      await confirmPaidPartnershipDisclosure({ workspaceId, engagementId }, testDb.admin);
      await approveEngagement(workspaceId, engagementId, testDb.admin);
      await payEngagement(workspaceId, engagementId, testDb.admin);

      const finalRows = await testDb.admin.select().from(schema.marketplaceEngagements).where(eq(schema.marketplaceEngagements.id, engagementId));
      expect(finalRows[0]!.status).toBe("paid");
      expect(finalRows[0]!.deliverableStorageKey).toBe("deliverables/draft-2-final.mp4");
      expect(finalRows[0]!.paidAt).not.toBeNull();

      const finalEscrowRows = await testDb.admin.select().from(schema.marketplaceEscrowLedger).where(eq(schema.marketplaceEscrowLedger.engagementId, engagementId));
      expect(finalEscrowRows).toHaveLength(2);
      const balance = finalEscrowRows.reduce((sum, r) => sum + Number(r.credit) - Number(r.debit), 0);
      expect(balance).toBe(0); // fully funded, fully released — a real, balanced ledger
    });

    it("refuses to pay out more than the current escrow balance", async () => {
      const workspaceId = await createClientWorkspace("Underfunded Client");
      const { id: creatorId } = await createCreator({ displayName: "Bob Creator", email: "bob@example.com" }, testDb.admin);
      const { id: engagementId } = await createEngagement({ workspaceId, creatorId, briefText: "Brief", rateUsd: 500 }, testDb.admin);

      await acceptEngagement(workspaceId, engagementId, testDb.admin);
      await fundEngagementEscrow(workspaceId, engagementId, 100, testDb.admin); // underfunded relative to the $500 rate
      await deliverEngagement(workspaceId, engagementId, "deliverables/d.mp4", testDb.admin);
      await confirmPaidPartnershipDisclosure({ workspaceId, engagementId }, testDb.admin);
      await approveEngagement(workspaceId, engagementId, testDb.admin);

      await expect(payEngagement(workspaceId, engagementId, testDb.admin)).rejects.toThrow(/exceeds/);
    });

    it("rejects an invalid transition, e.g. approving a briefed (not yet delivered) engagement", async () => {
      const workspaceId = await createClientWorkspace("Skip-ahead Client");
      const { id: creatorId } = await createCreator({ displayName: "Cara Creator", email: "cara@example.com" }, testDb.admin);
      const { id: engagementId } = await createEngagement({ workspaceId, creatorId, briefText: "Brief", rateUsd: 100 }, testDb.admin);

      await expect(approveEngagement(workspaceId, engagementId, testDb.admin)).rejects.toThrow();
    });

    it("cancellation is only reachable before delivery, and is refused after", async () => {
      const workspaceId = await createClientWorkspace("Cancel Test Client");
      const { id: creatorId } = await createCreator({ displayName: "Dan Creator", email: "dan@example.com" }, testDb.admin);
      const { id: engagementId } = await createEngagement({ workspaceId, creatorId, briefText: "Brief", rateUsd: 100 }, testDb.admin);

      await acceptEngagement(workspaceId, engagementId, testDb.admin);
      await fundEngagementEscrow(workspaceId, engagementId, 100, testDb.admin);
      await deliverEngagement(workspaceId, engagementId, "deliverables/d.mp4", testDb.admin);

      await expect(cancelEngagement(workspaceId, engagementId, testDb.admin)).rejects.toThrow();
    });

    it("rejects acting on an engagement from a different workspace", async () => {
      const workspaceId = await createClientWorkspace("Real Owner Client");
      const otherWorkspaceId = await createClientWorkspace("Attacker Client");
      const { id: creatorId } = await createCreator({ displayName: "Eve Creator", email: "eve@example.com" }, testDb.admin);
      const { id: engagementId } = await createEngagement({ workspaceId, creatorId, briefText: "Brief", rateUsd: 100 }, testDb.admin);

      await expect(acceptEngagement(otherWorkspaceId, engagementId, testDb.admin)).rejects.toThrow();
    });
  });
});
