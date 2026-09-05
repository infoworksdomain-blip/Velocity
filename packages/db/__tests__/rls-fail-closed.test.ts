import { Pool } from "pg";
import { describe, expect } from "vitest";
import { insertMinimalRow } from "./helpers/fixture-builder";
import { itWithDb } from "./helpers/it-with-db";

/**
 * ADR 0003's fail-closed requirement: a query with app.workspace_id unset
 * must return zero rows, never an error and never every row. This is the
 * behavior withWorkspace(undefined, ...) in src/client.ts relies on being
 * true at the database level, not just documented.
 */
describe("RLS fails closed when app.workspace_id is unset (ADR 0003)", () => {
  itWithDb("an unset app.workspace_id yields zero rows, not all rows", async () => {
    const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
    const appPool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      // Create one real row so "zero rows" is a meaningful assertion, not
      // a table that was already empty.
      const orgId = await insertMinimalRow(adminPool, "organisations", null, new Map());
      const workspaceId = await insertMinimalRow(
        adminPool,
        "workspaces",
        null,
        new Map([["organisations", orgId]]),
      );
      await insertMinimalRow(adminPool, "brand_profiles", workspaceId, new Map());

      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        // Deliberately do NOT set app.workspace_id.
        const result = await client.query("SELECT id FROM brand_profiles");
        expect(result.rows).toEqual([]);
        await client.query("COMMIT");
      } finally {
        client.release();
      }

      // Sanity check the fixture itself is sound: the same row IS visible
      // once app.workspace_id is actually set, proving the zero-rows
      // result above is RLS, not a broken fixture.
      const client2 = await appPool.connect();
      try {
        await client2.query("BEGIN");
        await client2.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
        const result2 = await client2.query("SELECT id FROM brand_profiles");
        expect(result2.rows.length).toBeGreaterThan(0);
        await client2.query("COMMIT");
      } finally {
        client2.release();
      }
    } finally {
      await adminPool.end();
      await appPool.end();
    }
  });
});
