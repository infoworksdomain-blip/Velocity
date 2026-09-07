import type { ConceptDraft, ContentFormat } from "@velocity/contracts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { StructuredTextProvider } from "./angle-generator.js";
import { generateAngles } from "./angle-generator.js";
import { buildConceptTextPlan } from "./build-concept-text-plan.js";
import { buildConceptMatrix, type PersonaRef } from "./concept-matrix.js";
import { rejectNearDuplicates, type DedupeCandidate } from "./dedupe.js";
import { predictConceptScore } from "./predicted-score.js";
import { buildStoryboard } from "./storyboard-builder.js";
import type { UsageRecorderTx } from "../metering/usage-recorder.js";
import { recordUsage } from "../metering/usage-recorder.js";
import { scoreBlueprints, type BlueprintCandidate } from "../trends/blueprint-retrieval.js";

/**
 * The real STEP 8.2 pipeline: BrandProfile -> N angles -> for each
 * angle x format x persona, a ContentConcept. Replaces STEP 5's
 * StubConceptGenerationProvider (which stays in place — it serves
 * onboarding's quick-preview need, a different concern from this bulk
 * pipeline). Everything here is real except two seams, both flagged
 * inline: `textProvider` is a stub pending STEP 8B's real Anthropic/
 * OpenAI adapters, and `generatePreviewImage` is optional pending a real
 * ImageProvider wired in by the caller (STEP 8's stub adapters, via
 * packages/providers' router).
 */

export interface EmbedderLike {
  embed(texts: string[]): Promise<number[][]>;
}

export interface ConceptGeneratorDeps {
  textProvider: StructuredTextProvider;
  embedder: EmbedderLike;
  fetchBlueprintCandidates: (nicheTags: string[]) => Promise<BlueprintCandidate[]>;
  fetchHookHistory: () => Promise<number[][]>;
  generatePreviewImage?: (hook: string) => Promise<string | null>;
  tx: UsageRecorderTx;
}

export interface ConceptBatchInput {
  workspaceId: string;
  brandProfile: {
    product: string;
    category: string;
    oneLiner: string | null;
    pains: string[];
    differentiators: string[];
    ctaVariants: string[];
  };
  personas: PersonaRef[];
  angleCount: number;
  formats: ContentFormat[];
  conceptsPerAngle: number;
}

export interface ConceptBatchResult {
  concepts: ConceptDraft[];
  costUsd: number;
  usageEventIds: string[];
}

const HookGenerationResultSchema = z.object({
  results: z.array(
    z.object({
      hook: z.string().min(1).max(60),
      variants: z
        .array(z.object({ text: z.string().max(60), pattern: z.string(), predictedCtr: z.number().min(0).max(1) }))
        .min(5)
        .max(8),
    }),
  ),
});

export async function generateConceptBatch(deps: ConceptGeneratorDeps, input: ConceptBatchInput): Promise<ConceptBatchResult> {
  const usageEventIds: string[] = [];
  let costUsd = 0;

  // 1. Angles [8B stub], metered.
  const angleResult = await generateAngles(
    { textProvider: deps.textProvider, tx: deps.tx },
    {
      workspaceId: input.workspaceId,
      product: input.brandProfile.product,
      category: input.brandProfile.category,
      pains: input.brandProfile.pains,
      differentiators: input.brandProfile.differentiators,
      angleCount: input.angleCount,
    },
  );
  costUsd += angleResult.costUsd;
  usageEventIds.push(angleResult.usageEventId);

  // 2. Embed angle descriptions + the brand itself [real, deterministic].
  const brandText = [input.brandProfile.oneLiner, input.brandProfile.product, input.brandProfile.category]
    .filter(Boolean)
    .join(" — ");
  const [brandEmbedding, ...angleEmbeddings] = await deps.embedder.embed([
    brandText,
    ...angleResult.angles.map((a) => a.description),
  ]);

  // 3. Retrieve blueprint candidates once for the category, score per angle [real].
  const candidates = await deps.fetchBlueprintCandidates([input.brandProfile.category]);
  const now = new Date();

  // 4. Angle x format x persona fan-out [real, pure].
  const slots = buildConceptMatrix({
    angles: angleResult.angles,
    formats: input.formats,
    personas: input.personas,
    conceptsPerAngle: input.conceptsPerAngle,
  });
  if (slots.length === 0) {
    return { concepts: [], costUsd, usageEventIds };
  }

  // 5. ONE batched hook-generation call for every slot [8B stub], metered — never fan out to N calls (build script 8B.6).
  const hookSystem = [
    "You write short-form video hooks (<=60 chars, sentence case, no brand name in the first three words).",
    "For each numbered slot below, produce one primary hook plus 5-8 variants with a hook pattern and a predicted click-through rate.",
    "Return ONLY the tool call — no prose.",
  ].join(" ");
  const hookInput = JSON.stringify(
    slots.map((slot, i) => ({ index: i, angle: slot.angle.description, format: slot.format })),
  );

  const hookResult = await deps.textProvider.generateStructured<z.infer<typeof HookGenerationResultSchema>>({
    system: hookSystem,
    input: hookInput,
    schema: HookGenerationResultSchema,
    maxTokens: 4000,
    temperature: 0.7,
  });
  costUsd += hookResult.costUsd;
  const { usageEventId: hookUsageEventId } = await recordUsage(deps.tx, {
    workspaceId: input.workspaceId,
    provider: deps.textProvider.id,
    model: deps.textProvider.model,
    units: hookResult.usage.inputTokens + hookResult.usage.outputTokens,
    costUsd: hookResult.costUsd,
    jobKind: "text",
  });
  usageEventIds.push(hookUsageEventId);

  // 6-8. Storyboard, blueprint match, predicted score — real, per slot.
  const hookEmbeddings = await deps.embedder.embed(hookResult.data.results.map((r: { hook: string }) => r.hook));
  const history = await deps.fetchHookHistory();

  const draftsWithEmbeddings: (DedupeCandidate<ConceptDraft> & { blueprintId: string | null })[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const angleEmbedding = angleEmbeddings[angleResult.angles.indexOf(slot.angle)] ?? angleEmbeddings[0]!;
    const scored = scoreBlueprints(candidates, angleEmbedding, now);
    const matched = scored[0] ?? null;

    const storyboard = buildStoryboard({
      hook: hookResult.data.results[i]!.hook,
      productDescription: input.brandProfile.product,
      format: slot.format,
      blueprint: matched?.structure ?? null,
    });

    const angleBrandCosine = cosineOf(angleEmbedding, brandEmbedding!);
    const predictedScore = predictConceptScore({
      blueprintVelocityScore: matched?.structure.velocityScore ?? null,
      blueprintAgeDays: matched?.ageDays ?? null,
      angleBrandCosine,
      format: slot.format,
    });

    const previewAssetStorageKey = deps.generatePreviewImage ? await deps.generatePreviewImage(hookResult.data.results[i]!.hook) : null;

    const { textPlan, hookPattern } = buildConceptTextPlan({
      placeholderContentItemId: randomUUID(),
      hook: hookResult.data.results[i]!.hook,
      variants: hookResult.data.results[i]!.variants,
      ctaText: input.brandProfile.ctaVariants[0] ?? "Learn more",
    });

    const draft: ConceptDraft = {
      angleKind: slot.angle.kind,
      format: slot.format,
      personaId: slot.personaId,
      blueprintId: matched?.id ?? null,
      hook: hookResult.data.results[i]!.hook,
      hookPattern,
      storyboard,
      textPlanId: null, // set by the persistence layer once it has a real row id (apps/web's content-service.ts) — this draft carries the plan itself, not yet a DB id
      textPlan,
      previewAssetStorageKey,
      predictedScore,
      aiGenerated: true,
    };

    draftsWithEmbeddings.push({ item: draft, embedding: hookEmbeddings[i]!, blueprintId: matched?.id ?? null });
  }

  // 9. Dedupe against workspace hook history + within this batch [real].
  const concepts = rejectNearDuplicates(
    draftsWithEmbeddings.map((d) => ({ item: d.item, embedding: d.embedding })),
    history,
  );

  return { concepts, costUsd, usageEventIds };
}

function cosineOf(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
