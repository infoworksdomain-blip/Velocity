-- STEP 9: rename the "Blitz" swipe-queue feature to "Velocity" (user
-- request). Hand-written rename, not a generated migration — a rename is
-- exactly what drizzle-kit's schema diff cannot express without an
-- interactive rename-detection prompt this non-interactive environment
-- can't answer; ALTER TABLE/COLUMN RENAME is the correct, data-preserving
-- primitive for this anyway (a drop+recreate would lose the existing FK
-- constraints' target and any real rows, unlike a plain rename).
--
-- RLS policies and FK constraints survive a rename automatically (Postgres
-- keeps them attached to the table's OID, not its name) — nothing else in
-- this migration is needed for tenant isolation to keep working. FK
-- constraint names keep their old "blitz_..." auto-generated names
-- (Postgres does not rename constraints when you rename a table); this is
-- cosmetic only and left as-is rather than manually renaming each one.
ALTER TABLE "blitz_sessions" RENAME TO "velocity_sessions";--> statement-breakpoint
ALTER TABLE "blitz_events" RENAME TO "velocity_events";--> statement-breakpoint
ALTER TABLE "velocity_events" RENAME COLUMN "blitz_session_id" TO "velocity_session_id";
