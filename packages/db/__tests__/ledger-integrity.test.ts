import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe, expect } from "vitest";
import { insertMinimalRow } from "./helpers/fixture-builder";
import { itWithDb } from "./helpers/it-with-db";

/**
 * STEP 2 design decision 3: credit_balances is a materialised view
 * refreshed from credit_ledger, never a mutable column. This proves the
 * view matches the ledger's sum, and that the grant-level restriction
 * (0001_rls_and_policies.up.sql) actually blocks UPDATE/DELETE for the
 * app role — not just that application code happens not to attempt it.
 */
describe("credit ledger integrity (STEP 2 design decision 3)", () => {
  itWithDb("credit_balances matches the sum of ledger movements", async () => {
    const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const orgId = await insertMinimalRow(adminPool, "organisations", null, new Map());
      const workspaceId = await insertMinimalRow(
        adminPool,
        "workspaces",
        null,
        new Map([["organisations", orgId]]),
      );

      await adminPool.query(
        "INSERT INTO credit_ledger (id, workspace_id, debit, credit, reason) VALUES ($1, $2, $3, $4, $5)",
        [randomUUID(), workspaceId, 0, 500, "plan_grant"],
      );
      await adminPool.query(
        "INSERT INTO credit_ledger (id, workspace_id, debit, credit, reason) VALUES ($1, $2, $3, $4, $5)",
        [randomUUID(), workspaceId, 200, 0, "video_render"],
      );

      const balance = await adminPool.query<{ balance: string }>(
        "SELECT balance FROM credit_balances WHERE workspace_id = $1",
        [workspaceId],
      );
      expect(Number(balance.rows[0]!.balance)).toBe(300);
    } finally {
      await adminPool.end();
    }
  });

  itWithDb("the app role cannot UPDATE or DELETE a credit_ledger row", async () => {
    const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
    const appPool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      const orgId = await insertMinimalRow(adminPool, "organisations", null, new Map());
      const workspaceId = await insertMinimalRow(
        adminPool,
        "workspaces",
        null,
        new Map([["organisations", orgId]]),
      );
      const ledgerId = randomUUID();
      await adminPool.query(
        "INSERT INTO credit_ledger (id, workspace_id, debit, credit, reason) VALUES ($1, $2, $3, $4, $5)",
        [ledgerId, workspaceId, 0, 100, "topup"],
      );

      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
        await expect(
          client.query("UPDATE credit_ledger SET credit = 999 WHERE id = $1", [ledgerId]),
        ).rejects.toThrow(/permission denied/i);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }

      const client2 = await appPool.connect();
      try {
        await client2.query("BEGIN");
        await client2.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
        await expect(client2.query("DELETE FROM credit_ledger WHERE id = $1", [ledgerId])).rejects.toThrow(
          /permission denied/i,
        );
        await client2.query("ROLLBACK");
      } finally {
        client2.release();
      }
    } finally {
      await adminPool.end();
      await appPool.end();
    }
  });
});
