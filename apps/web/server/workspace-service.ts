import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import { getAdminDb } from "./db";

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
