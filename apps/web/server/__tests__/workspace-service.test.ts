// @vitest-environment node
import { randomUUID } from "node:crypto";
import { auth, notifications } from "@velocity/core";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sendInvitationNotification } from "../workspace-service";

/**
 * Post-STEP-22 audit remediation: workspace.ts's `members.invite` used to
 * insert an `invitations` row and never tell anyone. Proven against real
 * PGlite, same db-parameter pattern as auth-service.test.ts. The email
 * provider is a fake here for the same reason auth-service.test.ts's is —
 * ResendEmailProvider's own SDK behavior is covered separately.
 */
describe("sendInvitationNotification (post-STEP-22 audit remediation)", () => {
  let testDb: PgliteTestDb;
  let organisationId: string;
  let workspaceId: string;
  let inviterId: string;

  beforeAll(async () => {
    const { createPgliteTestDb } = await import("@velocity/db/dist/testing/pglite.js");
    testDb = await createPgliteTestDb();

    organisationId = randomUUID();
    workspaceId = randomUUID();
    inviterId = randomUUID();

    await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Acme Creators", workspaceType: "business" });
    await testDb.admin.insert(schema.users).values({ id: inviterId, email: "owner@acme.example", name: "Ada Owner" });
  }, 90000);

  afterAll(async () => {
    await testDb.close();
  });

  afterEach(() => notifications.resetForTests());

  function fakeProvider(): { provider: auth.EmailProvider; sent: Array<{ to: string; subject: string; text: string; html?: string }> } {
    const sent: Array<{ to: string; subject: string; text: string; html?: string }> = [];
    return {
      sent,
      provider: {
        id: "fake",
        send: vi.fn(async (message) => {
          sent.push(message);
          return { messageId: "fake-id" };
        }),
      },
    };
  }

  it("emails the invitee with the workspace name, inviter name, and a real accept link", async () => {
    const invitationId = randomUUID();
    const { provider, sent } = fakeProvider();

    await sendInvitationNotification({ invitationId, workspaceId, inviteeEmail: "newperson@example.com", inviterUserId: inviterId }, testDb.admin, provider);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("newperson@example.com");
    expect(sent[0]?.subject).toContain("Acme Creators");
    expect(sent[0]?.subject).toContain("Ada Owner");
    expect(sent[0]?.text).toContain(`/accept-invite/${invitationId}`);
  });

  it("publishes an in-app invitation_received notification when the invitee already has an account", async () => {
    const existingUserId = randomUUID();
    await testDb.admin.insert(schema.users).values({ id: existingUserId, email: "already-a-user@example.com" });

    const handler = vi.fn();
    notifications.subscribe("invitation_received", handler);

    const invitationId = randomUUID();
    const { provider } = fakeProvider();
    await sendInvitationNotification({ invitationId, workspaceId, inviteeEmail: "already-a-user@example.com", inviterUserId: inviterId }, testDb.admin, provider);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "invitation_received", workspaceId, userId: existingUserId, data: { invitationId } }),
    );
  });

  it("sends the email but publishes no in-app notification when the invitee has no account yet", async () => {
    const handler = vi.fn();
    notifications.subscribe("invitation_received", handler);

    const { provider, sent } = fakeProvider();
    await sendInvitationNotification({ invitationId: randomUUID(), workspaceId, inviteeEmail: "brand-new-nobody@example.com", inviterUserId: inviterId }, testDb.admin, provider);

    expect(sent).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();
  });
});
