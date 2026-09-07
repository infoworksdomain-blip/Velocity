import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../src/schema/index.js";
import { createPgliteTestDb, type PgliteTestDb } from "../src/testing/pglite.js";

/**
 * Proves the PGlite harness itself is real: genuine migration replay
 * (58+ tables, including migration 0001's dynamic RLS-introspection loop),
 * genuine RLS enforcement (not simulated), and genuine cross-tenant
 * isolation — the same property tenant-isolation.generated.test.ts proves
 * against a real network Postgres, but this needs none and so actually
 * runs in this environment, unlike that `itWithDb`-gated test.
 */
describe("PGlite test harness — a real embedded Postgres, not a mock", () => {
  let testDb: PgliteTestDb;
  let orgId: string;
  let workspaceAId: string;
  let workspaceBId: string;

  beforeAll(async () => {
    testDb = await createPgliteTestDb();

    orgId = randomUUID();
    workspaceAId = randomUUID();
    workspaceBId = randomUUID();
    await testDb.admin.insert(schema.organisations).values({ id: orgId, name: "Org" });
    await testDb.admin.insert(schema.workspaces).values([
      { id: workspaceAId, organisationId: orgId, name: "A", workspaceType: "individual" },
      { id: workspaceBId, organisationId: orgId, name: "B", workspaceType: "individual" },
    ]);
    await testDb.admin.insert(schema.brandProfiles).values([
      { id: randomUUID(), workspaceId: workspaceAId, version: 1, product: "Product A", category: "software", sourceUrl: "https://a.example.com" },
      { id: randomUUID(), workspaceId: workspaceBId, version: 1, product: "Product B", category: "software", sourceUrl: "https://b.example.com" },
    ]);
  }, 90000); // generous: PGlite's WASM init + full migration replay genuinely slows down under full-monorepo-suite system load (many concurrent heavy test processes), not a hang

  afterAll(async () => {
    await testDb.close();
  });

  it("replays all real migrations, creating every table", async () => {
    const result = await testDb.admin.execute(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const row = (result as unknown as { rows: { n: number }[] }).rows[0]!;
    expect(row.n).toBeGreaterThan(50);
  });

  it("RLS lets a workspace see its own row through the app role", async () => {
    const visibleToA = await testDb.runInWorkspaceTx(workspaceAId, (db) =>
      db.select({ product: schema.brandProfiles.product }).from(schema.brandProfiles),
    );
    expect(visibleToA).toEqual([{ product: "Product A" }]);
  });

  it("RLS genuinely blocks a cross-workspace read — B never sees A's row, even querying by A's id explicitly", async () => {
    const visibleToB = await testDb.runInWorkspaceTx(workspaceBId, (db) =>
      db.select({ product: schema.brandProfiles.product }).from(schema.brandProfiles).where(eq(schema.brandProfiles.workspaceId, workspaceAId)),
    );
    expect(visibleToB).toEqual([]);
  });

  it("RLS fails closed for a workspace id that matches no row — zero rows, not every row", async () => {
    const nonExistentWorkspaceId = randomUUID();
    const rows = await testDb.runInWorkspaceTx(nonExistentWorkspaceId, (db) => db.select().from(schema.brandProfiles));
    expect(rows).toEqual([]);
  });

  it("the admin connection bypasses RLS (mirrors createAdminDb() — used for fixtures, never for tenant-scoped app logic)", async () => {
    const rows = await testDb.admin.select({ product: schema.brandProfiles.product }).from(schema.brandProfiles);
    expect(rows.length).toBe(2);
  });

  it("the app role can insert into credit_ledger without tripping the refresh_credit_balances trigger (regression — found during STEP 8, see migration 0008)", async () => {
    // Before migration 0008, this failed with "permission denied for
    // materialized view credit_balances": the AFTER INSERT trigger ran
    // with the INSERTING role's privileges (velocity_app), which has no
    // REFRESH grant on the view. SECURITY DEFINER fixes it. This was never
    // caught pre-STEP-8 because every prior test inserted into
    // credit_ledger through the admin connection, never through the app
    // role in a live-tested path.
    await expect(
      testDb.runInWorkspaceTx(workspaceAId, (db) =>
        db.insert(schema.creditLedger).values({ id: randomUUID(), workspaceId: workspaceAId, debit: 0, credit: 100, reason: "test_topup" }),
      ),
    ).resolves.not.toThrow();

    const balance = await testDb.admin.execute(sql`SELECT balance FROM credit_balances WHERE workspace_id = ${workspaceAId}`);
    const row = (balance as unknown as { rows: { balance: string }[] }).rows[0];
    expect(Number(row?.balance)).toBeGreaterThanOrEqual(100);
  });
});
