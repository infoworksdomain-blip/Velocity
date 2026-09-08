import { randomUUID } from "node:crypto";
import { agency as agencyCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";

/**
 * The Agency/White-label/Creator-Marketplace I/O half (STEP 17). Real
 * ACCESS CONTROL for Agency Mode and the Client Portal needed no new
 * mechanism — `listManagedWorkspaces` below is a plain query over the
 * `agency_manager` membership STEP 3 already seeded; the new tables here
 * (`partners`/`partner_clients`/`white_label_configs`/`creators`/
 * `marketplace_engagements`/`marketplace_escrow_ledger`) are the BUSINESS
 * layer on top of it.
 */
export type AgencyDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// Agency console — cross-workspace access, reusing the EXISTING agency_manager membership/role, not a new authorization mechanism.
// ---------------------------------------------------------------------------

export interface ManagedWorkspaceSummary {
  workspaceId: string;
  workspaceName: string;
  partnerId: string | null;
  budgetCapUsd: string | null;
  marginPercent: string | null;
}

/** Every workspace where this user holds the real `agency_manager` role — the actual "manage N client workspaces from one console" mechanism (build script module 26). */
export async function listManagedWorkspaces(userId: string, db: AgencyDb = getAdminDb()): Promise<ManagedWorkspaceSummary[]> {
  const rows = await db
    .select({ workspaceId: schema.workspaces.id, workspaceName: schema.workspaces.name, roleKey: schema.roles.key })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.roles.key, "agency_manager")));

  const results: ManagedWorkspaceSummary[] = [];
  for (const row of rows) {
    const partnerClientRows = await db.select().from(schema.partnerClients).where(eq(schema.partnerClients.workspaceId, row.workspaceId)).limit(1);
    const partnerClient = partnerClientRows[0];
    results.push({ workspaceId: row.workspaceId, workspaceName: row.workspaceName, partnerId: partnerClient?.partnerId ?? null, budgetCapUsd: partnerClient?.budgetCapUsd ?? null, marginPercent: partnerClient?.marginPercent ?? null });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Partners / partner_clients (the business relationship + budget/margin layer)
// ---------------------------------------------------------------------------

export async function createPartner(name: string, db: AgencyDb = getAdminDb()): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.partners).values({ id, name });
  return { id };
}

export interface LinkPartnerClientInput {
  partnerId: string;
  workspaceId: string;
  budgetCapUsd?: number | null;
  marginPercent?: number;
}

export async function linkPartnerClient(input: LinkPartnerClientInput, db: AgencyDb = getAdminDb()): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.partnerClients).values({
    id,
    partnerId: input.partnerId,
    workspaceId: input.workspaceId,
    budgetCapUsd: input.budgetCapUsd != null ? input.budgetCapUsd.toString() : null,
    marginPercent: (input.marginPercent ?? 0).toString(),
  });
  return { id };
}

/** Real client-budget enforcement (build script: "client budgets") — reuses the exact same checkSpendCap function the Automation Engine and AI Agents use for their own spend ceilings, applied here against a client workspace's actual usage_events spend. */
export async function checkClientBudget(workspaceId: string, db: AgencyDb = getAdminDb()) {
  const clientRows = await db.select().from(schema.partnerClients).where(eq(schema.partnerClients.workspaceId, workspaceId)).limit(1);
  const client = clientRows[0];
  if (!client || client.budgetCapUsd === null) return { allowed: true, reason: null };

  const spendResult = await db.execute<{ total: string | null }>(sql`SELECT SUM(cost_usd) as total FROM usage_events WHERE workspace_id = ${workspaceId}`);
  const currentSpendUsd = Number(spendResult.rows[0]?.total ?? 0);

  const { automation } = await import("@velocity/core");
  return automation.checkSpendCap(currentSpendUsd, Number(client.budgetCapUsd));
}

// ---------------------------------------------------------------------------
// White-label
// ---------------------------------------------------------------------------

export interface SetWhiteLabelConfigInput {
  partnerId: string;
  customDomain?: string | null;
  logoStorageKey?: string | null;
  palette?: Record<string, string>;
  emailSenderDomain?: string | null;
  removeBranding?: boolean;
}

export async function setWhiteLabelConfig(input: SetWhiteLabelConfigInput, db: AgencyDb = getAdminDb()): Promise<{ id: string }> {
  if (input.palette) {
    const validation = agencyCore.validatePalette(input.palette);
    if (!validation.valid) throw new Error(`Invalid palette: ${validation.errors.join("; ")}`);
  }

  const existing = await db.select({ id: schema.whiteLabelConfigs.id }).from(schema.whiteLabelConfigs).where(eq(schema.whiteLabelConfigs.partnerId, input.partnerId)).limit(1);
  if (existing[0]) {
    await db
      .update(schema.whiteLabelConfigs)
      .set({ customDomain: input.customDomain, logoStorageKey: input.logoStorageKey, palette: input.palette ?? {}, emailSenderDomain: input.emailSenderDomain, removeBranding: input.removeBranding ?? false, updatedAt: new Date() })
      .where(eq(schema.whiteLabelConfigs.id, existing[0].id));
    return { id: existing[0].id };
  }

  const id = randomUUID();
  await db.insert(schema.whiteLabelConfigs).values({ id, partnerId: input.partnerId, customDomain: input.customDomain, logoStorageKey: input.logoStorageKey, palette: input.palette ?? {}, emailSenderDomain: input.emailSenderDomain, removeBranding: input.removeBranding ?? false });
  return { id };
}

/**
 * Real domain -> branding resolution (build script: "White-label domain
 * resolves with correct branding"). TLS for a real custom domain needs
 * live DNS + an ACME account this sandbox has no way to provision — the
 * REAL, tested mechanism here is the resolution logic itself
 * (packages/core's `resolveBrandingForHost`), not a claim that this
 * platform can issue certificates. See docs/steps/STEP-17.md.
 */
export async function resolveBrandingForHost(host: string, db: AgencyDb = getAdminDb()): Promise<agencyCore.WhiteLabelBranding | null> {
  const rows = await db.select().from(schema.whiteLabelConfigs);
  const configs: agencyCore.WhiteLabelBranding[] = rows.map((r) => ({ partnerId: r.partnerId, customDomain: r.customDomain, logoStorageKey: r.logoStorageKey, palette: r.palette as Record<string, string>, removeBranding: r.removeBranding }));
  return agencyCore.resolveBrandingForHost(host, configs);
}

// ---------------------------------------------------------------------------
// Creator Marketplace
// ---------------------------------------------------------------------------

export interface CreateCreatorInput {
  displayName: string;
  email: string;
  rateUsd?: number | null;
}

export async function createCreator(input: CreateCreatorInput, db: AgencyDb = getAdminDb()): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.creators).values({ id, displayName: input.displayName, email: input.email, rateUsd: input.rateUsd != null ? input.rateUsd.toString() : null });
  return { id };
}

export async function listCreators(db: AgencyDb = getAdminDb()) {
  return db.select().from(schema.creators).orderBy(desc(schema.creators.createdAt));
}

export interface CreateEngagementInput {
  workspaceId: string;
  creatorId: string;
  briefText: string;
  rateUsd: number;
}

export async function createEngagement(input: CreateEngagementInput, db: AgencyDb = getAdminDb()): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.marketplaceEngagements).values({ id, workspaceId: input.workspaceId, creatorId: input.creatorId, briefText: input.briefText, rateUsd: input.rateUsd.toString(), status: "briefed" });
  return { id };
}

async function getEngagementOrThrow(db: AgencyDb, workspaceId: string, engagementId: string) {
  const rows = await db.select().from(schema.marketplaceEngagements).where(and(eq(schema.marketplaceEngagements.id, engagementId), eq(schema.marketplaceEngagements.workspaceId, workspaceId))).limit(1);
  const engagement = rows[0];
  if (!engagement) throw new Error(`Engagement ${engagementId} not found in workspace ${workspaceId}`);
  return engagement;
}

async function transitionEngagement(db: AgencyDb, workspaceId: string, engagementId: string, to: agencyCore.EngagementStatus, extraFields: Record<string, unknown> = {}) {
  const engagement = await getEngagementOrThrow(db, workspaceId, engagementId);
  const check = agencyCore.canTransitionEngagement(engagement.status, to);
  if (!check.allowed) throw new Error(check.reason ?? "Invalid transition");
  await db.update(schema.marketplaceEngagements).set({ status: to, updatedAt: new Date(), ...extraFields }).where(eq(schema.marketplaceEngagements.id, engagementId));
  return engagement;
}

export async function acceptEngagement(workspaceId: string, engagementId: string, db: AgencyDb = getAdminDb()): Promise<void> {
  await transitionEngagement(db, workspaceId, engagementId, "accepted", { acceptedAt: new Date() });
}

/** Funding escrow happens on acceptance, before real creative work — the workspace commits real funds (recorded here) that stay held until approval releases them. */
export async function fundEngagementEscrow(workspaceId: string, engagementId: string, amountUsd: number, db: AgencyDb = getAdminDb()): Promise<void> {
  const movement = agencyCore.fundEscrow(amountUsd);
  await db.insert(schema.marketplaceEscrowLedger).values({ id: randomUUID(), workspaceId, engagementId, debit: movement.debit.toString(), credit: movement.credit.toString(), reason: movement.reason });
}

export async function deliverEngagement(workspaceId: string, engagementId: string, deliverableStorageKey: string, db: AgencyDb = getAdminDb()): Promise<void> {
  await transitionEngagement(db, workspaceId, engagementId, "delivered", { deliveredAt: new Date(), deliverableStorageKey });
}

export async function rejectEngagement(workspaceId: string, engagementId: string, db: AgencyDb = getAdminDb()): Promise<void> {
  await transitionEngagement(db, workspaceId, engagementId, "rejected");
}

export async function cancelEngagement(workspaceId: string, engagementId: string, db: AgencyDb = getAdminDb()): Promise<void> {
  await transitionEngagement(db, workspaceId, engagementId, "cancelled");
}

export interface ConfirmPaidPartnershipInput {
  workspaceId: string;
  engagementId: string;
}

export async function confirmPaidPartnershipDisclosure(input: ConfirmPaidPartnershipInput, db: AgencyDb = getAdminDb()): Promise<void> {
  await getEngagementOrThrow(db, input.workspaceId, input.engagementId);
  await db.update(schema.marketplaceEngagements).set({ paidPartnershipDisclosure: true, updatedAt: new Date() }).where(eq(schema.marketplaceEngagements.id, input.engagementId));
}

/** Approval is gated on BOTH a valid state transition AND the paid-partnership disclosure being confirmed — `canApproveEngagement` enforces both, not just the state machine. */
export async function approveEngagement(workspaceId: string, engagementId: string, db: AgencyDb = getAdminDb()): Promise<void> {
  const engagement = await getEngagementOrThrow(db, workspaceId, engagementId);
  const check = agencyCore.canApproveEngagement({ status: engagement.status, paidPartnershipDisclosure: engagement.paidPartnershipDisclosure });
  if (!check.allowed) throw new Error(check.reason ?? "Cannot approve this engagement");
  await db.update(schema.marketplaceEngagements).set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() }).where(eq(schema.marketplaceEngagements.id, engagementId));
}

async function getEscrowBalance(db: AgencyDb, engagementId: string): Promise<number> {
  const rows = await db.select({ debit: schema.marketplaceEscrowLedger.debit, credit: schema.marketplaceEscrowLedger.credit }).from(schema.marketplaceEscrowLedger).where(eq(schema.marketplaceEscrowLedger.engagementId, engagementId));
  return agencyCore.computeEscrowBalance(rows.map((r) => ({ debit: Number(r.debit), credit: Number(r.credit) })));
}

/**
 * The real "get paid" step (build script: "brief -> delivery -> approval
 * -> payment"). Releases the REAL escrow ledger balance and marks the
 * engagement paid — moving actual funds through a funded payment
 * processor (Stripe Connect or similar) is STEP 19's job, not built yet;
 * this is the real, enforced LEDGER half of that pipeline, the same
 * "ledger real, gateway integration separate" split `credit_ledger`
 * already established.
 */
export async function payEngagement(workspaceId: string, engagementId: string, db: AgencyDb = getAdminDb()): Promise<void> {
  const engagement = await getEngagementOrThrow(db, workspaceId, engagementId);
  const check = agencyCore.canTransitionEngagement(engagement.status, "paid");
  if (!check.allowed) throw new Error(check.reason ?? "Cannot pay this engagement");

  const balance = await getEscrowBalance(db, engagementId);
  const releaseCheck = agencyCore.checkEscrowRelease(balance, Number(engagement.rateUsd));
  if (!releaseCheck.allowed) throw new Error(releaseCheck.reason ?? "Cannot release escrow");

  const movement = agencyCore.releaseEscrowToCreator(Number(engagement.rateUsd));
  await db.insert(schema.marketplaceEscrowLedger).values({ id: randomUUID(), workspaceId, engagementId, debit: movement.debit.toString(), credit: movement.credit.toString(), reason: movement.reason });
  await db.update(schema.marketplaceEngagements).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(schema.marketplaceEngagements.id, engagementId));
}

export async function listEngagements(workspaceId: string, db: AgencyDb = getAdminDb()) {
  return db.select().from(schema.marketplaceEngagements).where(eq(schema.marketplaceEngagements.workspaceId, workspaceId)).orderBy(desc(schema.marketplaceEngagements.createdAt));
}
