import { createAdminDb, type Database } from "@velocity/db";

/**
 * Lazily creates the long-lived admin Drizzle instance on first use, not
 * at module import time. Next.js evaluates route modules during its build
 * (page-data collection) even when nothing in the route actually runs —
 * an eager `createAdminDb()` at the top level throws immediately because
 * DATABASE_URL isn't set in that context, crashing `next build` outright.
 * Connecting lazily, on the first real request, avoids that entirely.
 */
let cached: Database | undefined;

export function getAdminDb(): Database {
  cached ??= createAdminDb();
  return cached;
}
