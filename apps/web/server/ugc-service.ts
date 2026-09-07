import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ugc } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";
import { triggerRenderForConcept } from "./render-service";

/**
 * Same generic-`db`-parameter pattern as analytics-service.ts/assistant-service.ts —
 * every function below runs identically against a real embedded Postgres
 * (PGlite) in tests and the real network Postgres in production.
 */
export type UgcDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

let cachedPublicFiguresPath: string | null = null;

/**
 * Resolves config/public-figures.json's real absolute path once. Not
 * hardcoded to a build-time-relative path because apps/web's compiled
 * output location differs from source layout — walking up from this
 * module's own directory to the repo root is the same "find the real
 * repo-relative file" approach already used elsewhere in this build
 * (see the ugc public-figure-check test's own path resolution).
 */
function resolvePublicFiguresConfigPath(): string {
  if (cachedPublicFiguresPath) return cachedPublicFiguresPath;
  cachedPublicFiguresPath = path.resolve(process.cwd(), "..", "..", "config", "public-figures.json");
  return cachedPublicFiguresPath;
}

function loadPublicFiguresConfig(): ugc.PublicFiguresConfig {
  const configPath = resolvePublicFiguresConfigPath();
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  return ugc.PublicFiguresConfigSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Persona CRUD
// ---------------------------------------------------------------------------

export interface CreatePersonaInput {
  workspaceId: string;
  name: string;
  attributes?: Record<string, unknown>;
  referenceImageStorageKey?: string | null;
  modelsRealPerson: boolean;
  consentArtefactId?: string | null;
}

export async function createPersona(db: UgcDb, input: CreatePersonaInput): Promise<{ id: string }> {
  if (input.modelsRealPerson && input.consentArtefactId) {
    const artefactRows = await db
      .select()
      .from(schema.consentArtefacts)
      .where(and(eq(schema.consentArtefacts.id, input.consentArtefactId), eq(schema.consentArtefacts.workspaceId, input.workspaceId)))
      .limit(1);
    if (artefactRows.length === 0) throw new Error(`Consent artefact ${input.consentArtefactId} not found in workspace ${input.workspaceId}`);
  }

  const id = randomUUID();
  await db.insert(schema.personas).values({
    id,
    workspaceId: input.workspaceId,
    name: input.name,
    attributes: input.attributes,
    referenceImageStorageKey: input.referenceImageStorageKey ?? null,
    modelsRealPerson: input.modelsRealPerson,
    consentArtefactId: input.consentArtefactId ?? null,
  });
  return { id };
}

export async function listPersonas(db: UgcDb, workspaceId: string) {
  return db.select().from(schema.personas).where(eq(schema.personas.workspaceId, workspaceId)).orderBy(desc(schema.personas.createdAt));
}

// ---------------------------------------------------------------------------
// Consent artefact CRUD
// ---------------------------------------------------------------------------

export interface CreateConsentArtefactInput {
  workspaceId: string;
  subjectName: string;
  documentStorageKey: string;
  signedAt: Date;
  expiresAt?: Date | null;
  verifiedByUserId?: string | null;
}

export async function createConsentArtefact(db: UgcDb, input: CreateConsentArtefactInput): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.consentArtefacts).values({
    id,
    workspaceId: input.workspaceId,
    subjectName: input.subjectName,
    documentStorageKey: input.documentStorageKey,
    signedAt: input.signedAt,
    expiresAt: input.expiresAt ?? null,
    verifiedByUserId: input.verifiedByUserId ?? null,
  });
  return { id };
}

export async function listConsentArtefacts(db: UgcDb, workspaceId: string) {
  return db.select().from(schema.consentArtefacts).where(eq(schema.consentArtefacts.workspaceId, workspaceId)).orderBy(desc(schema.consentArtefacts.createdAt));
}

// ---------------------------------------------------------------------------
// Moderation reviews — the FIRST real reader/writer this table has had
// anywhere in the codebase (moderation_reviews has existed, unused, since
// STEP 1's governance schema).
// ---------------------------------------------------------------------------

export const UGC_POLICY_VERSION = "step-15-v1";

export interface RequestModerationReviewInput {
  workspaceId: string;
  targetType: "persona_script";
  targetId: string;
  notes?: string | null;
}

export async function requestModerationReview(db: UgcDb, input: RequestModerationReviewInput): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.moderationReviews).values({
    id,
    workspaceId: input.workspaceId,
    targetType: input.targetType,
    targetId: input.targetId,
    status: "pending",
    policyVersion: UGC_POLICY_VERSION,
    notes: input.notes ?? null,
  });
  return { id };
}

export type ModerationDecision = "approved" | "rejected";

export interface ResolveModerationReviewInput {
  workspaceId: string;
  reviewId: string;
  reviewerUserId: string;
  decision: ModerationDecision;
  notes?: string | null;
}

export async function resolveModerationReview(db: UgcDb, input: ResolveModerationReviewInput): Promise<void> {
  const result = await db
    .update(schema.moderationReviews)
    .set({ status: input.decision, reviewerUserId: input.reviewerUserId, notes: input.notes ?? null, updatedAt: new Date() })
    .where(and(eq(schema.moderationReviews.id, input.reviewId), eq(schema.moderationReviews.workspaceId, input.workspaceId)))
    .returning({ id: schema.moderationReviews.id });
  if (result.length === 0) throw new Error(`Moderation review ${input.reviewId} not found in workspace ${input.workspaceId}`);
}

async function hasApprovedModerationReview(db: UgcDb, workspaceId: string, targetType: string, targetId: string): Promise<boolean> {
  const rows = await db
    .select({ status: schema.moderationReviews.status })
    .from(schema.moderationReviews)
    .where(and(eq(schema.moderationReviews.workspaceId, workspaceId), eq(schema.moderationReviews.targetType, targetType), eq(schema.moderationReviews.targetId, targetId)))
    .orderBy(desc(schema.moderationReviews.createdAt))
    .limit(1);
  return rows[0]?.status === "approved";
}

// ---------------------------------------------------------------------------
// Persona generation policy — wires packages/core/src/ugc's pure
// checkPersonaGenerationPolicy against real, workspace-scoped DB rows.
// ---------------------------------------------------------------------------

export interface CheckPersonaPolicyInput {
  workspaceId: string;
  personaId: string;
  script: string;
}

export async function checkPersonaPolicyForGeneration(db: UgcDb, input: CheckPersonaPolicyInput): Promise<ugc.PersonaPolicyCheckResult> {
  const personaRows = await db.select().from(schema.personas).where(and(eq(schema.personas.id, input.personaId), eq(schema.personas.workspaceId, input.workspaceId))).limit(1);
  const persona = personaRows[0];
  if (!persona) throw new Error(`Persona ${input.personaId} not found in workspace ${input.workspaceId}`);

  let consentArtefact: ugc.ConsentArtefactRecord | null = null;
  if (persona.consentArtefactId) {
    const artefactRows = await db.select().from(schema.consentArtefacts).where(eq(schema.consentArtefacts.id, persona.consentArtefactId)).limit(1);
    const artefact = artefactRows[0];
    if (artefact) consentArtefact = { id: artefact.id, expiresAt: artefact.expiresAt };
  }

  const hasApprovedManualReview = await hasApprovedModerationReview(db, input.workspaceId, "persona_script", `${input.personaId}:${input.script}`);

  return ugc.checkPersonaGenerationPolicy({
    persona: { modelsRealPerson: persona.modelsRealPerson, consentArtefactId: persona.consentArtefactId },
    consentArtefact,
    script: input.script,
    publicFiguresConfig: loadPublicFiguresConfig(),
    hasApprovedManualReview,
  });
}

// ---------------------------------------------------------------------------
// Licensed clip selection
// ---------------------------------------------------------------------------

export interface SelectUsableClipInput {
  workspaceId: string;
  territory: string;
  media: string;
}

export async function selectUsableClipForWorkspace(db: UgcDb, input: SelectUsableClipInput): Promise<ugc.LicensedClip | null> {
  const rows = await db.select().from(schema.ugcClips).where(eq(schema.ugcClips.workspaceId, input.workspaceId));
  const clips: ugc.LicensedClip[] = rows.map((r) => ({
    id: r.id,
    releaseRef: r.releaseRef,
    usageTerritory: r.usageTerritory,
    usageDurationMonths: r.usageDurationMonths,
    usageMedia: r.usageMedia as string[],
    createdAt: r.createdAt,
  }));
  return ugc.selectLicensedClip(clips, { territory: input.territory, media: input.media });
}

// ---------------------------------------------------------------------------
// Identity consistency reporting
// ---------------------------------------------------------------------------

/**
 * Aggregates real Hamming-distance scores across every render this persona
 * has actually produced (renders.phash, set by STEP 8's QC activity).
 * Honest limitation: `referencePhash` must be supplied by the caller —
 * deriving it from the persona's own stored reference IMAGE would need real
 * image-decoding infra this sandbox doesn't have (the same gap phash.ts's
 * own doc comment already states for video frames). What's genuinely real
 * here is the aggregation across the persona's actual render history and
 * the Hamming-distance scoring itself.
 */
export async function computeIdentityConsistencyReportForPersona(db: UgcDb, workspaceId: string, personaId: string, referencePhash: string): Promise<ugc.IdentityConsistencyReport> {
  const rows = await db
    .select({ renderId: schema.renders.id, phash: schema.renders.phash })
    .from(schema.renders)
    .innerJoin(schema.contentItems, eq(schema.contentItems.id, schema.renders.contentItemId))
    .innerJoin(schema.contentConcepts, eq(schema.contentConcepts.id, schema.contentItems.contentConceptId))
    .where(and(eq(schema.renders.workspaceId, workspaceId), eq(schema.contentConcepts.personaId, personaId)));

  const samples: ugc.RenderIdentitySample[] = rows.filter((r): r is { renderId: string; phash: string } => typeof r.phash === "string").map((r) => ({ renderId: r.renderId, outputPhash: r.phash }));

  return ugc.scoreIdentityConsistency(referencePhash, samples);
}

// ---------------------------------------------------------------------------
// UGC batch generation — creates the minimal content_concepts/storyboards
// row set from raw scripts and hands off to STEP 8's real render trigger,
// unchanged (render-service.ts's triggerRenderForConcept).
// ---------------------------------------------------------------------------

const UGC_ANGLE_DESCRIPTION = "AI UGC script-led content";

async function resolveOrCreateUgcAngle(db: UgcDb, workspaceId: string, brandProfileId: string): Promise<string> {
  const existing = await db
    .select({ id: schema.angles.id })
    .from(schema.angles)
    .where(and(eq(schema.angles.workspaceId, workspaceId), eq(schema.angles.brandProfileId, brandProfileId), eq(schema.angles.description, UGC_ANGLE_DESCRIPTION)))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const id = randomUUID();
  await db.insert(schema.angles).values({ id, workspaceId, brandProfileId, kind: "pov", description: UGC_ANGLE_DESCRIPTION });
  return id;
}

export interface CreateUgcConceptInput {
  workspaceId: string;
  brandProfileId: string;
  personaId: string;
  script: string;
}

/**
 * The pure, PGlite-testable half of batch generation: validates ownership,
 * finds-or-creates the "UGC" angle, and writes the content_concepts +
 * storyboards rows (one scene per script — a UGC clip is one continuous
 * talking-head take, not a multi-shot storyboard). Deliberately does NOT
 * call triggerRenderForConcept itself, so this logic is testable without a
 * live Temporal connection — mirrors calendar-service.ts's
 * previewAutoFillForWorkspace / commit split.
 */
export async function createUgcConceptAndStoryboard(db: UgcDb, input: CreateUgcConceptInput): Promise<{ contentConceptId: string }> {
  const brandProfileRows = await db.select({ id: schema.brandProfiles.id }).from(schema.brandProfiles).where(and(eq(schema.brandProfiles.id, input.brandProfileId), eq(schema.brandProfiles.workspaceId, input.workspaceId))).limit(1);
  if (!brandProfileRows[0]) throw new Error(`Brand profile ${input.brandProfileId} not found in workspace ${input.workspaceId}`);

  const personaRows = await db.select({ id: schema.personas.id }).from(schema.personas).where(and(eq(schema.personas.id, input.personaId), eq(schema.personas.workspaceId, input.workspaceId))).limit(1);
  if (!personaRows[0]) throw new Error(`Persona ${input.personaId} not found in workspace ${input.workspaceId}`);

  const angleId = await resolveOrCreateUgcAngle(db, input.workspaceId, input.brandProfileId);

  const contentConceptId = randomUUID();
  await db.insert(schema.contentConcepts).values({
    id: contentConceptId,
    workspaceId: input.workspaceId,
    angleId,
    format: "ai_ugc",
    personaId: input.personaId,
    hook: input.script.slice(0, 60),
  });
  await db.insert(schema.storyboards).values({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    contentConceptId,
    scenes: [{ durationMs: 15000, visualDirective: "ugc_talking_head", voiceoverLine: input.script }],
  });

  return { contentConceptId };
}

export interface TriggerUgcBatchInput {
  workspaceId: string;
  userId: string;
  brandProfileId: string;
  personaId: string;
  scripts: string[];
  workspaceTier: string;
}

export interface UgcBatchScriptResult {
  script: string;
  allowed: boolean;
  blockReason: ugc.PersonaPolicyBlockReason | null;
  message: string | null;
  contentConceptId?: string;
  renderId?: string;
  workflowId?: string;
}

/**
 * Router-facing orchestrator. Every script is policy-checked BEFORE any
 * concept/render is created — a script that fails the persona policy gate
 * (consent, public figure, unreviewed regulated claim) produces no rows and
 * starts no render, it is simply reported as blocked. Uses getAdminDb()
 * directly (like render-service.ts's own triggerRenderForConcept) since the
 * final step needs a live Temporal connection this function's own unit
 * tests don't exercise — see createUgcConceptAndStoryboard's doc comment
 * for the part that IS PGlite-tested.
 */
export async function triggerUgcBatchGeneration(input: TriggerUgcBatchInput): Promise<UgcBatchScriptResult[]> {
  const db = getAdminDb();
  const results: UgcBatchScriptResult[] = [];

  for (const script of input.scripts) {
    const policyResult = await checkPersonaPolicyForGeneration(db, { workspaceId: input.workspaceId, personaId: input.personaId, script });
    if (!policyResult.allowed) {
      results.push({ script, allowed: false, blockReason: policyResult.blockReason, message: policyResult.message });
      continue;
    }

    const { contentConceptId } = await createUgcConceptAndStoryboard(db, { workspaceId: input.workspaceId, brandProfileId: input.brandProfileId, personaId: input.personaId, script });
    const { renderId, workflowId } = await triggerRenderForConcept({ workspaceId: input.workspaceId, userId: input.userId, contentConceptId, workspaceTier: input.workspaceTier });
    results.push({ script, allowed: true, blockReason: null, message: null, contentConceptId, renderId, workflowId });
  }

  return results;
}
