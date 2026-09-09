import { randomUUID } from "node:crypto";
import { auth, notifications } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";

export type WorkspaceServiceDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Looks up the baseline (workspace_id IS NULL) global role by key — seeded
 * once in packages/db/seed/seed.ts. Shared by workspace.ts and
 * onboarding.ts so workspace creation has exactly one implementation
 * rather than two that can drift.
 */
export async function findGlobalRoleId(key: string): Promise<string> {
  const rows = await getAdminDb()
    .select({ id: schema.roles.id })
    .from(schema.roles)
    .where(and(eq(schema.roles.scope, "workspace"), eq(schema.roles.key, key)))
    .limit(1);
  const role = rows[0];
  if (!role) {
    throw new Error(`Role "${key}" is not seeded`);
  }
  return role.id;
}

export interface CreateWorkspaceInput {
  name: string;
  workspaceType: "individual" | "business";
  timezone?: string;
  organisationId?: string;
}

export interface CreatedWorkspace {
  workspaceId: string;
  organisationId: string;
}

/** Creates a workspace (and a new organisation for it unless one is given), with the caller as owner. Used by both workspace.create and onboarding.complete. */
export async function createWorkspaceForUser(
  userId: string,
  input: CreateWorkspaceInput,
): Promise<CreatedWorkspace> {
  const db = getAdminDb();

  let organisationId = input.organisationId;
  if (!organisationId) {
    organisationId = randomUUID();
    await db.insert(schema.organisations).values({ id: organisationId, name: input.name });
  }

  const workspaceId = randomUUID();
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    organisationId,
    name: input.name,
    workspaceType: input.workspaceType,
    timezone: input.timezone ?? "UTC",
  });

  const ownerRoleId = await findGlobalRoleId("owner");
  await db.insert(schema.memberships).values({
    id: randomUUID(),
    workspaceId,
    userId,
    roleId: ownerRoleId,
  });

  return { workspaceId, organisationId };
}

/**
 * Post-STEP-22 audit remediation: `members.invite` (workspace.ts) used to
 * insert an `invitations` row and stop — nobody was ever actually told.
 * This sends the real email (the invitee's only path to the accept link,
 * since they may not have an account yet) and, when the invitee already
 * has an account, publishes the already-defined-but-never-used
 * `invitation_received` notification bus event (packages/core's bus has
 * carried this type since STEP 7 with zero producers). db-parameter
 * pattern for testability, matching auth-service.ts's shape.
 */
export async function sendInvitationNotification(
  input: { invitationId: string; workspaceId: string; inviteeEmail: string; inviterUserId: string },
  db: WorkspaceServiceDb = getAdminDb(),
  emailProvider: auth.EmailProvider = auth.createEmailProvider(),
): Promise<void> {
  const [workspaceRows, inviterRows, existingInviteeRows] = await Promise.all([
    db.select({ name: schema.workspaces.name }).from(schema.workspaces).where(eq(schema.workspaces.id, input.workspaceId)).limit(1),
    db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, input.inviterUserId)).limit(1),
    db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.inviteeEmail)).limit(1),
  ]);

  const workspaceName = workspaceRows[0]?.name ?? "a workspace";
  const inviterLabel = inviterRows[0]?.name ?? inviterRows[0]?.email ?? "Someone";
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const acceptUrl = `${appBaseUrl}/accept-invite/${input.invitationId}`;

  await emailProvider.send({
    to: input.inviteeEmail,
    subject: `${inviterLabel} invited you to join ${workspaceName} on VELOCITY`,
    text: `${inviterLabel} has invited you to join "${workspaceName}" on VELOCITY. This invitation expires in 7 days.\n\nAccept it here: ${acceptUrl}`,
    html: `<p>${inviterLabel} has invited you to join <strong>${workspaceName}</strong> on VELOCITY. This invitation expires in 7 days.</p><p><a href="${acceptUrl}">Accept the invitation</a></p>`,
  });

  const existingInvitee = existingInviteeRows[0];
  if (existingInvitee) {
    notifications.publish({
      type: "invitation_received",
      workspaceId: input.workspaceId,
      userId: existingInvitee.id,
      title: `Invitation to join ${workspaceName}`,
      body: `${inviterLabel} invited you to join ${workspaceName}.`,
      data: { invitationId: input.invitationId },
    });
  }
}
