import { boolean, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { workspaces } from "./tenancy";

export const automations = pgTable("automations", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  name: text("name").notNull(),
  trigger: jsonb("trigger").$type<{ kind: string; config: Record<string, unknown> }>().notNull(),
  condition: jsonb("condition").$type<Record<string, unknown>>(),
  action: jsonb("action").$type<{ kind: string; config: Record<string, unknown> }>().notNull(),
  spendCapUsd: numeric("spend_cap_usd", { precision: 10, scale: 2 }),
  isDryRun: boolean("is_dry_run").notNull().default(false),
  ...timestamps(),
});

export const automationRuns = pgTable("automation_runs", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  automationId: uuid("automation_id")
    .notNull()
    .references(() => automations.id),
  status: text("status").notNull(), // queued | running | succeeded | failed
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  resultSummary: jsonb("result_summary").$type<Record<string, unknown>>(),
  ...timestamps(),
});

/**
 * Goal-directed AI agent runs (STEP 16). `spendCapUsd` and `spendUsd` are
 * the row STEP 16's hard spend-ceiling check reads — enforcement is against
 * this persisted running total, not an in-memory counter that a restart
 * would reset.
 */
export const agentRuns = pgTable("agent_runs", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  goal: text("goal").notNull(),
  spendCapUsd: numeric("spend_cap_usd", { precision: 10, scale: 2 }).notNull(),
  spendUsd: numeric("spend_usd", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull(), // running | completed | killed | spend_cap_reached
  stepTrace: jsonb("step_trace").$type<Array<Record<string, unknown>>>().notNull().default([]),
  ...timestamps(),
});
