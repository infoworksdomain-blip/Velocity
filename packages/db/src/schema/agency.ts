import { boolean, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, workspaceIdColumn } from "./_helpers";
import { marketplaceEngagementStatusEnum } from "./enums";
import { users, workspaces } from "./tenancy";

/**
 * STEP 17 — Agency, White-label, Creator Marketplace.
 *
 * `partners`/`creators` are platform-root (no workspace_id, no RLS) —
 * exactly like `organisations`/`users` (ADR 0003): a partner or a creator
 * is not owned by any single workspace, the same reasoning that keeps
 * the tenancy root platform-scoped. Agency ACCESS CONTROL itself needs no
 * new mechanism at all — STEP 3 already seeded an `agency_manager`
 * workspace role with a real `agency:manage_clients:workspace` permission
 * and a `client` role with `client_portal:approve:workspace`, both
 * already in the real permission catalogue and simply unused by any
 * router until this step. `partners`/`partner_clients` here are the
 * BUSINESS layer on top of that existing access model — which client
 * workspaces a given reseller manages, their budget cap, and margin —
 * not a parallel authorization system.
 */

export const partners = pgTable("partners", {
  id: idColumn(),
  name: text("name").notNull(),
  ...timestamps(),
});

export const partnerClients = pgTable(
  "partner_clients",
  {
    id: idColumn(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id),
    workspaceId: workspaceIdColumn().references(() => workspaces.id),
    budgetCapUsd: numeric("budget_cap_usd", { precision: 10, scale: 2 }),
    marginPercent: numeric("margin_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("partner_clients_partner_workspace_idx").on(table.partnerId, table.workspaceId)],
);

/**
 * One real config per partner (build script: "custom domain, logo,
 * palette, email sender domain, optional 'powered by' removal by plan").
 * `palette` is a flat token-name -> CSS-color-value map resolved to real
 * CSS custom properties AT RUNTIME (see packages/core/src/agency/white-
 * label.ts) — never compiled into Tailwind classes, which is the build
 * script's own literal architectural requirement for this to work at all
 * (a compiled palette can't vary per tenant after the build is shipped).
 * `domainVerifiedAt` is null until a real DNS+TLS provisioning flow
 * verifies the domain — genuinely infeasible in this sandbox (no live
 * domain, no ACME account); see docs/steps/STEP-17.md.
 */
export const whiteLabelConfigs = pgTable("white_label_configs", {
  id: idColumn(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => partners.id)
    .unique(),
  customDomain: text("custom_domain"),
  domainVerifiedAt: timestamp("domain_verified_at", { withTimezone: true }),
  logoStorageKey: text("logo_storage_key"),
  palette: jsonb("palette").$type<Record<string, string>>().notNull().default({}),
  emailSenderDomain: text("email_sender_domain"),
  removeBranding: boolean("remove_branding").notNull().default(false),
  ...timestamps(),
});

/**
 * A vetted creator (build script module 29). `userId` is nullable — a
 * creator can be recorded before they've ever created a platform account
 * (an agency/workspace sources them first, invites them second).
 * `payoutDetailsRef` is an opaque reference to a real payment processor's
 * payout method — never raw bank/card details, the same custody
 * discipline as `platform_credentials`/webhook secrets/API keys.
 * `identityVerifiedAt` is real state this table tracks; the actual KYC
 * *call* needs a funded third-party identity-verification service
 * (Stripe Identity, Persona, etc.) this sandbox doesn't have — flagged,
 * not faked, in docs/steps/STEP-17.md.
 */
export const creators = pgTable("creators", {
  id: idColumn(),
  userId: uuid("user_id").references(() => users.id),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  rateUsd: numeric("rate_usd", { precision: 10, scale: 2 }),
  identityVerifiedAt: timestamp("identity_verified_at", { withTimezone: true }),
  payoutDetailsRef: text("payout_details_ref"),
  ...timestamps(),
});

/**
 * One engagement per brief (build script: "receive briefs, deliver, get
 * paid... per-engagement contract... paid-partnership disclosure").
 * `contractRef` is an opaque reference to the actual signed contract
 * document (the same "reference, not the thing itself" pattern as
 * `releaseRef` on `ugc_clips`). `paidPartnershipDisclosure` records that
 * the workspace has confirmed the deliverable will carry a paid-
 * partnership disclosure where the platform requires one — a real,
 * required field this build never lets a delivery skip past.
 */
export const marketplaceEngagements = pgTable("marketplace_engagements", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => creators.id),
  briefText: text("brief_text").notNull(),
  rateUsd: numeric("rate_usd", { precision: 10, scale: 2 }).notNull(),
  status: marketplaceEngagementStatusEnum("status").notNull().default("briefed"),
  contractRef: text("contract_ref"),
  deliverableStorageKey: text("deliverable_storage_key"),
  paidPartnershipDisclosure: boolean("paid_partnership_disclosure").notNull().default(false),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  ...timestamps(),
});

/**
 * Append-only, double-entry — the exact same real discipline as
 * `credit_ledger` (STEP 2 design decision 3): no code path can express
 * "change a past movement," only "record a new one." Real escrow STATE
 * (funded -> released/refunded) is enforced here for real; moving actual
 * money through a real payment processor needs STEP 19's eventual funded
 * Stripe integration (not built yet) — the same "real ledger, funded
 * gateway is a separate concern" precedent `usage_events`/`credit_ledger`
 * already established for C5 metering.
 */
export const marketplaceEscrowLedger = pgTable("marketplace_escrow_ledger", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => marketplaceEngagements.id),
  debit: numeric("debit", { precision: 10, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 10, scale: 2 }).notNull().default("0"),
  reason: text("reason").notNull(), // funded | released_to_creator | refunded_to_workspace
  ...timestamps(),
});
