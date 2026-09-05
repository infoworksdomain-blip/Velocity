import { integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { workspaces } from "./tenancy";

/**
 * Append-only, double-entry. `debit`/`credit` are separate columns so no
 * write path can express "update the balance" — only "record a movement."
 * The queryable balance is the `credit_balances` materialised view added in
 * migration 0001, refreshed from this table; it is never a mutable column
 * on `workspaces`.
 */
export const creditLedger = pgTable("credit_ledger", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  debit: integer("debit").notNull().default(0),
  credit: integer("credit").notNull().default(0),
  reason: text("reason").notNull(), // e.g. "video_render", "image_generate", "text_generate", "topup", "plan_grant"
  referenceId: uuid("reference_id"), // the usage_event, invoice, or manual-adjustment row this movement corresponds to
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The literal implementation of C5 — every model call (video, image, text)
 * writes one of these before its response returns. All four columns are
 * `not null`; there is no un-metered path by construction.
 */
export const usageEvents = pgTable("usage_events", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  units: numeric("units", { precision: 12, scale: 4 }).notNull(),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull(),
  jobKind: text("job_kind").notNull(), // video | image | text | tts | transcription
  referenceId: uuid("reference_id"), // the render, text_plan, etc. this call produced
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  planKey: text("plan_key").notNull(), // free | starter | growth | pro
  status: text("status").notNull(), // active | past_due | canceled | trialing
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  ...timestamps(),
});

export const invoices = pgTable("invoices", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  stripeInvoiceId: text("stripe_invoice_id").notNull(),
  amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull(), // draft | open | paid | uncollectible | void
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  ...timestamps(),
});
