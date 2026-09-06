import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn } from "./_helpers";

/**
 * Platform-root, deliberately NOT RLS-protected (no ENABLE/FORCE/POLICY in
 * a migration — unlike every table introspected in 0001, this one is added
 * afterward and stays out of that mechanism on purpose). Onboarding events
 * fire before a workspace exists (session_id is the only identity at that
 * point) and the eventual read pattern is platform-level funnel analysis
 * (STEP 14/18), not a tenant querying its own rows — the same shape as
 * `audit_logs`' platform-level rows, which are only reachable through the
 * admin connection.
 */
export const onboardingEvents = pgTable("onboarding_events", {
  id: idColumn(),
  sessionId: text("session_id").notNull(),
  workspaceId: uuid("workspace_id"),
  stage: text("stage").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
