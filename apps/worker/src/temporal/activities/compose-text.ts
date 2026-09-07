import { createHash } from "node:crypto";
import type { ContentFormat, ContentPlatformVariant, Storyboard } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { and, eq, isNull, desc } from "drizzle-orm";
import { selectOne } from "@velocity/providers";
import {
  TextPlanSchema,
  TEXT_PLAN_JSON_SCHEMA,
  buildSystemPrompt,
  buildUserMessage,
  runRepairLoop,
  buildTemplateFallback,
  boxForPlatforms,
  loadSafeAreasConfig,
  createHeuristicMeasurer,
  type TextProvider,
  type ValidationContext,
} from "@velocity/text-engine";
import { getProviderRegistry, getCircuitBreaker, getEmbedder, runInWorkspaceTx } from "./context.js";
import { withStep, type StepProviderStatus } from "./step-ledger.js";
import { resolveSafeAreasConfigPath } from "../../config-paths.js";

export interface ComposeTextInput {
  workspaceId: string;
  renderId: string;
  contentConceptId: string;
  textPlanId: string;
  storyboard: Storyboard;
  format: ContentFormat;
  targetPlatforms: ContentPlatformVariant[];
  regenerationRound: number;
  workspaceTier: string;
  costCeilingUsd: number;
}

export interface ComposeTextResult {
  textOverlayRef: string;
  textEngineImplemented: true;
  usedTemplateFallback: boolean;
}

const MAX_HOOK_CHARS = 60;
const DEFAULT_FONT_SIZE_RANGE = { minFontSizePx: 36, maxFontSizePx: 96 };

/**
 * The real STEP 8B pipeline, filling in the seam `compose-text.ts` left in
 * STEP 8. `render.ts`'s `render.start` mutation guarantees `textPlanId`
 * always points at an existing `text_plans` row (a real one from concept
 * generation, or a `{placeholder: true}` row it inserts itself) before the
 * workflow ever starts — so this activity's job is: if that row already
 * holds a schema-valid TextPlan, use it as-is (no re-spend, e.g. a resumed
 * or cache-hit render); otherwise generate one for real and persist it
 * into the SAME row (same id — content_items.textPlanId never needs to
 * change).
 */
export async function composeText(input: ComposeTextInput): Promise<ComposeTextResult> {
  const existingRows = await runInWorkspaceTx(input.workspaceId, (db) =>
    db.select().from(schema.textPlans).where(eq(schema.textPlans.id, input.textPlanId)).limit(1),
  );
  const existingRow = existingRows[0];
  if (!existingRow) throw new Error(`text_plans row ${input.textPlanId} not found — render.start should have created it before starting the workflow`);

  const existingParse = TextPlanSchema.safeParse(existingRow.plan);
  if (existingParse.success) {
    return { textOverlayRef: input.textPlanId, textEngineImplemented: true, usedTemplateFallback: false };
  }

  const gathered = await runInWorkspaceTx(input.workspaceId, async (db) => {
    const conceptRows = await db.select().from(schema.contentConcepts).where(eq(schema.contentConcepts.id, input.contentConceptId)).limit(1);
    const concept = conceptRows[0];
    if (!concept) throw new Error(`content_concepts row ${input.contentConceptId} not found`);

    const angleRows = await db.select().from(schema.angles).where(eq(schema.angles.id, concept.angleId)).limit(1);
    const angle = angleRows[0];
    if (!angle) throw new Error(`angles row ${concept.angleId} not found`);

    const brandProfileRows = await db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.id, angle.brandProfileId)).limit(1);
    const brandProfile = brandProfileRows[0];
    if (!brandProfile) throw new Error(`brand_profiles row ${angle.brandProfileId} not found`);

    const brandRulesRows = await db.select().from(schema.brandRules).where(eq(schema.brandRules.brandProfileId, brandProfile.id)).limit(1);
    const brandRules = brandRulesRows[0] ?? null;

    const blueprint = concept.blueprintId
      ? (await db.select().from(schema.trendBlueprints).where(eq(schema.trendBlueprints.id, concept.blueprintId)).limit(1))[0]
      : null;

    // Proxy for "last 200 published hooks" (8B.4): the workspace's most recent content_concepts
    // hook embeddings, the same source STEP 8.2's own duplicate check already uses (see
    // packages/core/src/content/concept-generator.ts) — kept consistent rather than introducing a
    // stricter "actually published" join this step; see docs/steps/STEP-08B.md.
    const historyRows = await db
      .select({ embedding: schema.contentConcepts.embedding })
      .from(schema.contentConcepts)
      .where(and(eq(schema.contentConcepts.workspaceId, input.workspaceId), isNull(schema.contentConcepts.deletedAt)))
      .orderBy(desc(schema.contentConcepts.createdAt))
      .limit(200);
    const hookHistoryEmbeddings = historyRows.map((r) => r.embedding as number[] | null).filter((e): e is number[] => Array.isArray(e));

    const presetRows = await db.select().from(schema.textStylePresets).where(eq(schema.textStylePresets.workspaceId, input.workspaceId));

    return { concept, angle, brandProfile, brandRules, blueprint, hookHistoryEmbeddings, presetRows };
  });

  const fontRangeByPreset = new Map(gathered.presetRows.map((p) => [p.name, { minFontSizePx: p.sizeMin, maxFontSizePx: p.sizeMax }]));

  const promptInput = {
    brandTone: gathered.brandProfile.tone ?? { voice: "friendly and direct", formality: "casual", humour: false, bannedWords: [] },
    brandRules: gathered.brandRules
      ? { bannedWords: gathered.brandRules.bannedWords, bannedClaims: gathered.brandRules.bannedClaims, requiredDisclaimers: gathered.brandRules.requiredDisclaimers }
      : { bannedWords: [], bannedClaims: [], requiredDisclaimers: [] },
    proofPoints: gathered.brandProfile.proofPoints,
    angleDescription: gathered.angle.description,
    hookPattern: gathered.blueprint?.hookPattern,
    captionCadence: gathered.blueprint?.captionCadence ?? undefined,
    format: input.format,
    platform: input.targetPlatforms[0]!,
    storyboard: input.storyboard,
    productFacts: { product: gathered.brandProfile.product, category: gathered.brandProfile.category, oneLiner: gathered.brandProfile.oneLiner ?? "" },
    maxHookChars: MAX_HOOK_CHARS,
  };

  const systemPrompt = buildSystemPrompt(promptInput);
  const userMessage = buildUserMessage(promptInput);

  const safeAreasConfig = loadSafeAreasConfig(resolveSafeAreasConfigPath());
  const safeBox = boxForPlatforms(safeAreasConfig, input.targetPlatforms);

  const validationCtx: ValidationContext = {
    brandRules: promptInput.brandRules,
    competitors: gathered.brandProfile.competitors,
    hookHistoryEmbeddings: gathered.hookHistoryEmbeddings,
    embedder: getEmbedder(),
    safeBox,
    getFontSizeRange: (stylePreset) => fontRangeByPreset.get(stylePreset) ?? DEFAULT_FONT_SIZE_RANGE,
    measurer: createHeuristicMeasurer(),
  };

  const registry = getProviderRegistry();
  const breaker = getCircuitBreaker();
  const { selection, provider } = await selectOne(registry, breaker, {
    kind: "text",
    workspaceTier: input.workspaceTier,
    costCeilingUsd: input.costCeilingUsd,
    required: { commercialUse: true },
    jobShape: { characters: systemPrompt.length + userMessage.length },
  });
  const textProvider = provider as TextProvider;

  const stepKey = `compose_text:${createHash("sha256")
    .update(JSON.stringify({ textPlanId: input.textPlanId, systemPrompt, userMessage, regenerationRound: input.regenerationRound }))
    .digest("hex")
    .slice(0, 16)}`;

  const stepResult = await withStep({
    runInWorkspaceTx: (fn) => runInWorkspaceTx(input.workspaceId, fn),
    workspaceId: input.workspaceId,
    renderId: input.renderId,
    stepKind: "compose_text",
    stepKey,
    provider: { id: selection.providerId, model: textProvider.model },
    jobKind: "text",
    units: systemPrompt.length + userMessage.length,
    submit: async () => {
      const firstAttempt = await textProvider.generateStructured<unknown, unknown>({
        system: systemPrompt,
        input: userMessage,
        schema: TEXT_PLAN_JSON_SCHEMA,
        maxTokens: 2000,
        temperature: 0.7,
      });

      const repaired = await runRepairLoop({
        textProvider,
        originalSystem: systemPrompt,
        originalInput: userMessage,
        schema: TEXT_PLAN_JSON_SCHEMA,
        maxTokens: 2000,
        temperature: 0.7,
        rawFirstAttempt: { ...(firstAttempt.data as object), contentItemId: input.textPlanId },
        ctx: validationCtx,
        templateFallback: () =>
          buildTemplateFallback({
            contentItemId: input.textPlanId,
            platform: input.targetPlatforms[0]!,
            angleDescription: gathered.angle.description,
            ctaText: gathered.brandProfile.ctaVariants[0] ?? "Learn more",
          }),
      });

      const totalCostUsd = firstAttempt.costUsd + repaired.costUsd;
      // The full result is encoded into externalJobId itself (a text column) rather than kept only
      // in memory: a real generateStructured call has no vendor-side "job id" to poll by (unlike
      // video/TTS jobs), so the entire terminal result must be captured atomically with submit() —
      // see docs/steps/STEP-08B.md's note on why this differs from the video/TTS steps' pattern.
      return {
        providerId: selection.providerId,
        externalJobId: JSON.stringify({ plan: repaired.plan, usedTemplateFallback: repaired.usedTemplateFallback, costUsd: totalCostUsd }),
      };
    },
    poll: async (handle) => {
      const decoded = JSON.parse(handle.externalJobId) as { plan: unknown; usedTemplateFallback: boolean; costUsd: number };
      return { state: "succeeded", costUsd: decoded.costUsd, plan: decoded.plan, usedTemplateFallback: decoded.usedTemplateFallback } as StepProviderStatus;
    },
  });

  const output = stepResult.output as StepProviderStatus & { plan: unknown; usedTemplateFallback: boolean };
  await runInWorkspaceTx(input.workspaceId, (db) => db.update(schema.textPlans).set({ plan: output.plan }).where(eq(schema.textPlans.id, input.textPlanId)));

  return { textOverlayRef: input.textPlanId, textEngineImplemented: true, usedTemplateFallback: output.usedTemplateFallback };
}
