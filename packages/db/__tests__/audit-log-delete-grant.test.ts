import { Pool } from "pg";
import { describe, expect } from "vitest";
import { itWithDb } from "./helpers/it-with-db";

/**
 * audit_logs is append-only by grant, not just by omitted code path
 * (threat model + STEP 2 governance table notes). This connects as the
 * actual app role and proves DELETE fails at the database level.
 */
describe("audit_logs DELETE is revoked at the grant level", () => {
  itWithDb("the app role cannot DELETE from audit_logs", async () => {
    const appPool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await expect(client.query("DELETE FROM audit_logs")).rejects.toThrow(/permission denied/i);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    } finally {
      await appPool.end();
    }
  });
});
