import { Pool } from "pg";
import { describe, expect } from "vitest";
import { loadMigrations, migrateDown, migrateUp } from "../src/migrator";
import { itWithDb } from "./helpers/it-with-db";

describe("migrations up/down (GATE 2)", () => {
  itWithDb("applies every migration, then reverts every migration, leaving an empty schema", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // Start from a known-clean slate regardless of what a prior run left behind.
      await migrateDown(pool, Infinity);

      const expectedNames = loadMigrations().map((m) => m.name);
      const ran = await migrateUp(pool);
      expect(ran).toEqual(expectedNames);

      // 49 from 0000 (STEP 2) + 4 auth tables from 0002 (STEP 3) = 53.
      // 0003 only adds columns to an existing table, not a new one.
      const tableCount = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(Number(tableCount.rows[0]!.count)).toBe(53);

      const reverted = await migrateDown(pool, Infinity);
      expect(reverted).toEqual([...expectedNames].reverse());

      const tableCountAfterDown = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(Number(tableCountAfterDown.rows[0]!.count)).toBe(0);

      // Round-trip: applying up again from empty must work identically.
      const ranAgain = await migrateUp(pool);
      expect(ranAgain).toEqual(expectedNames);
    } finally {
      await pool.end();
    }
  });
});
