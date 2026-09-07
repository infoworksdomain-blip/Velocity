import { randomUUID } from "node:crypto";
import { content } from "@velocity/core";
import { DeterministicEmbeddingProvider } from "@velocity/providers";
import { schema } from "@velocity/db";
import type { ConceptDraft, ContentFormat } from "@velocity/contracts";
import { and, desc, eq, isNull } from "drizzle-orm";

type StructuredTextProvider = content.StructuredTextProvider;
import { getAdminDb } from "./db";

/**
 * STEP 8's concept-generation pipeline (packages/core/src/content) needs a
 * StructuredTextProvider — STEP 8B's real Anthropic/OpenAI adapters don't
 * exist yet. This is a deterministic, pattern-based stub conforming
 * exactly to the real interface (schema/system/input/maxTokens/temperature
 * in, {data, usage, costUsd} out) so swapping in the real 8B adapters
 * later is a one-line change here, not a rewrite of this service.
 */
class StubStructuredTextProvider implements StructuredTextProvider {
  readonly id = "stub-text-provider";
  readonly model = "stub-v1";

  async generateStructured<TData>(args: {
    system: string;
    input: string;
    schema: unknown;
    maxTokens: number;
    temperature: number;
  }): Promise<{ data: TData; usage: { inputTokens: number; outputTokens: number }; costUsd: number }> {
    const parsedInput: unknown = JSON.parse(args.input);
    let data: unknown;

    if (args.system.includes("marketing angles")) {
      const input = parsedInput as { product: string; pains: string[] };
      const kinds = ["pain_led", "transformation", "comparison", "myth_bust", "pov"] as const;
      data = {
        angles: kinds.map((kind, i) => ({
          kind,
          description: `${kind.replace("_", " ")} angle for ${input.product}${input.pains[i] ? `: addressing "${input.pains[i]}"` : ""}`,
        })),
      };
    } else {
      const slots = parsedInput as { index: number; angle: string; format: ContentFormat }[];
      data = {
        results: slots.map((slot) => ({
          hook: `Why nobody talks about ${slot.angle.split(" ").slice(-1)[0] ?? "this"}`.slice(0, 60),
          variants: Array.from({ length: 5 }, (_, v) => ({
            text: `Variant ${v + 1}: ${slot.angle}`.slice(0, 60),
            pattern: "curiosity_gap",
            predictedCtr: 0.05 + v * 0.01,
          })),
        })),
      };
    }

    return { data: data as TData, usage: { inputTokens: 100, outputTokens: 100 }, costUsd: 0.002 };
  }
}

const textProvider = new StubStructuredTextProvider();
const embedder = new DeterministicEmbeddingProvider();

export interface GenerateConceptsInput {
  workspaceId: string;
  brandProfileId: string;
  personaIds: string[];
  angleCount: number;
  formats: ContentFormat[];
  conceptsPerAngle: number;
}

export async function generateConceptsForWorkspace(input: GenerateConceptsInput): Promise<{ concepts: ConceptDraft[]; costUsd: number }> {
  const db = getAdminDb();

  const brandProfileRows = await db.select().from(schema.brandProfiles).where(eq(schema.brandProfiles.id, input.brandProfileId)).limit(1);
  const brandProfile = brandProfileRows[0];
  if (!brandProfile) throw new Error(`Brand profile ${input.brandProfileId} not found`);

  const personas = input.personaIds.map((id) => ({ id }));

  const result = await content.generateConceptBatch(
    {
      textProvider,
      embedder,
      tx: db,
      fetchBlueprintCandidates: async (nicheTags) => {
        const rows = await db
          .select()
          .from(schema.trendBlueprints)
          .where(eq(schema.trendBlueprints.workspaceId, input.workspaceId))
          .limit(50);
        return rows
          .filter((r) => nicheTags.some((tag) => (r.nicheTags as string[]).includes(tag)) || nicheTags.length === 0)
          .map((r) => ({
            id: r.id,
            structure: {
              hookPattern: r.hookPattern,
              beatTimings: r.beatTimings as number[],
              shotGrammar: r.shotGrammar,
              captionCadence: r.captionCadence,
              textPlacement: r.textPlacement,
              audioArchetype: r.audioArchetype,
              nicheTags: r.nicheTags as string[],
              velocityScore: Number(r.velocityScore),
              sourceRef: r.sourceRef,
            },
            embedding: (r.embedding as number[] | null) ?? new Array(1536).fill(0),
            createdAt: r.createdAt,
          }));
      },
      fetchHookHistory: async () => {
        const rows = await db
          .select({ embedding: schema.contentConcepts.embedding })
          .from(schema.contentConcepts)
          .where(and(eq(schema.contentConcepts.workspaceId, input.workspaceId), isNull(schema.contentConcepts.deletedAt)))
          .orderBy(desc(schema.contentConcepts.createdAt))
          .limit(200);
        return rows.map((r) => r.embedding as number[]).filter((e): e is number[] => Array.isArray(e));
      },
    },
    {
      workspaceId: input.workspaceId,
      brandProfile: {
        product: brandProfile.product,
        category: brandProfile.category,
        oneLiner: brandProfile.oneLiner,
        pains: (brandProfile.pains as string[]) ?? [],
        differentiators: (brandProfile.differentiators as string[]) ?? [],
      },
      personas,
      angleCount: input.angleCount,
      formats: input.formats,
      conceptsPerAngle: input.conceptsPerAngle,
    },
  );

  // Persist: one angle row per distinct angle kind actually produced, then one content_concepts row per concept.
  const angleIdByKind = new Map<string, string>();
  for (const draft of result.concepts) {
    if (!angleIdByKind.has(draft.angleKind)) {
      const angleId = randomUUID();
      await db.insert(schema.angles).values({
        id: angleId,
        workspaceId: input.workspaceId,
        brandProfileId: input.brandProfileId,
        kind: draft.angleKind,
        description: draft.angleKind,
      });
      angleIdByKind.set(draft.angleKind, angleId);
    }
  }

  for (const draft of result.concepts) {
    const contentConceptId = randomUUID();
    await db.insert(schema.contentConcepts).values({
      id: contentConceptId,
      workspaceId: input.workspaceId,
      angleId: angleIdByKind.get(draft.angleKind)!,
      format: draft.format,
      personaId: draft.personaId,
      blueprintId: draft.blueprintId,
      hook: draft.hook,
      textPlanId: draft.textPlanId,
      previewAssetStorageKey: draft.previewAssetStorageKey,
      predictedScore: draft.predictedScore.toString(),
    });
    await db.insert(schema.storyboards).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      contentConceptId,
      scenes: draft.storyboard.scenes,
    });
  }

  return { concepts: result.concepts, costUsd: result.costUsd };
}
