import { Pool } from "pg";
import { describe, expect } from "vitest";
import { buildTwoWorkspaceFixture, queryVisibleIds } from "./helpers/fixture-builder";
import { itWithDb } from "./helpers/it-with-db";

/**
 * GATE 2's generated isolation test. This does NOT hand-maintain a table
 * list — it discovers every tenant table via information_schema at test
 * time (see helpers/fixture-builder.ts), builds two fully independent
 * tenants across the whole FK graph, and proves cross-tenant reads return
 * nothing, table by table, through the app-role connection (the one that
 * actually goes through RLS — the admin/owner connection would bypass it
 * and prove nothing).
 *
 * A table added in a future step with a workspace_id column is
 * automatically covered here the next time this runs, with no edit to
 * this file — that's the point.
 */
describe("tenant isolation (GATE 2, generated)", () => {
  itWithDb(
    "every tenant table returns zero rows of another tenant's data",
    async () => {
      const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
      const appPool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
      try {
        const fixture = await buildTwoWorkspaceFixture(adminPool);
        expect(fixture.tenantTables.length).toBeGreaterThan(0);

        for (const table of fixture.tenantTables) {
          const idA = fixture.rowsA.get(table);
          const idB = fixture.rowsB.get(table);
          expect(idA, `expected a fixture row for ${table} (workspace A)`).toBeDefined();
          expect(idB, `expected a fixture row for ${table} (workspace B)`).toBeDefined();

          const visibleToA = await queryVisibleIds(appPool, fixture.workspaceIdA, table, [idA!, idB!]);
          const visibleToB = await queryVisibleIds(appPool, fixture.workspaceIdB, table, [idA!, idB!]);

          expect(visibleToA, `workspace A should see only its own row in ${table}`).toEqual([idA]);
          expect(visibleToB, `workspace B should see only its own row in ${table}`).toEqual([idB]);
        }
      } finally {
        await adminPool.end();
        await appPool.end();
      }
    },
    30000,
  );
});
