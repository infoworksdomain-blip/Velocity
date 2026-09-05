import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createAdminPool } from "../src/client.js";

/**
 * Idempotent demo data: one organisation, one business workspace, a demo
 * owner user, and the baseline role set STEP 3's RBAC engine assigns from.
 * Runs on the admin connection (table owner) — seeding is an ops action,
 * not a tenant request, so it bypasses RLS intentionally rather than
 * needing app.workspace_id set per insert.
 */

const WORKSPACE_ROLE_KEYS = [
  "owner",
  "admin",
  "editor",
  "contributor",
  "viewer",
  "client",
  "agency_manager",
] as const;

const PLATFORM_ROLE_KEYS = ["superadmin", "support", "moderator", "finance"] as const;

async function findOrCreateRole(
  pool: ReturnType<typeof createAdminPool>,
  scope: "workspace" | "platform",
  key: string,
): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM roles WHERE workspace_id IS NULL AND scope = $1 AND key = $2",
    [scope, key],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const id = randomUUID();
  const name = key
    .split("_")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
  await pool.query(
    "INSERT INTO roles (id, workspace_id, scope, key, name, permissions) VALUES ($1, NULL, $2, $3, $4, '[]'::jsonb)",
    [id, scope, key, name],
  );
  return id;
}

async function main() {
  const pool = createAdminPool();
  try {
    console.log("Seeding baseline roles...");
    const roleIds: Record<string, string> = {};
    for (const key of WORKSPACE_ROLE_KEYS) {
      roleIds[key] = await findOrCreateRole(pool, "workspace", key);
    }
    for (const key of PLATFORM_ROLE_KEYS) {
      roleIds[key] = await findOrCreateRole(pool, "platform", key);
    }

    console.log("Seeding demo organisation + workspace...");
    let org = await pool.query<{ id: string }>(
      "SELECT id FROM organisations WHERE name = $1",
      ["Demo Organisation"],
    );
    let orgId = org.rows[0]?.id;
    if (!orgId) {
      orgId = randomUUID();
      await pool.query("INSERT INTO organisations (id, name) VALUES ($1, $2)", [
        orgId,
        "Demo Organisation",
      ]);
    }

    let workspace = await pool.query<{ id: string }>(
      "SELECT id FROM workspaces WHERE organisation_id = $1 AND name = $2",
      [orgId, "Demo Workspace"],
    );
    let workspaceId = workspace.rows[0]?.id;
    if (!workspaceId) {
      workspaceId = randomUUID();
      await pool.query(
        "INSERT INTO workspaces (id, organisation_id, name, workspace_type, timezone) VALUES ($1, $2, $3, $4, $5)",
        [workspaceId, orgId, "Demo Workspace", "business", "Europe/London"],
      );
    }

    console.log("Seeding demo user + membership...");
    let user = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      "owner@demo.velocity",
    ]);
    let userId = user.rows[0]?.id;
    if (!userId) {
      userId = randomUUID();
      await pool.query("INSERT INTO users (id, email, name) VALUES ($1, $2, $3)", [
        userId,
        "owner@demo.velocity",
        "Demo Owner",
      ]);
    }

    const membership = await pool.query(
      "SELECT id FROM memberships WHERE workspace_id = $1 AND user_id = $2",
      [workspaceId, userId],
    );
    if (!membership.rows[0]) {
      await pool.query(
        "INSERT INTO memberships (id, workspace_id, user_id, role_id) VALUES ($1, $2, $3, $4)",
        [randomUUID(), workspaceId, userId, roleIds.owner],
      );
    }

    console.log(`Done. Demo workspace id: ${workspaceId}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
