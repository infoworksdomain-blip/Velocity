import { z } from "zod";

/**
 * Trend blueprint contracts (STEP 8.3). `TrendSignalSchema` deliberately has
 * NO media-URL field — C3 ("store structure, never source footage") is
 * enforced at the type level here, not just by convention in the extractor.
 */

export const TrendSignalSchema = z.object({
  niche: z.string().min(1),
  captionText: z.string(),
  beatTimestampsMs: z.array(z.number().int().nonnegative()),
  engagement: z.object({
    views: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    shares: z.number().int().nonnegative(),
  }),
  observedAt: z.string().datetime(),
  /** Opaque, non-dereferenceable identifier for audit/provenance — never a playable URL. */
  sourceRef: z.string(),
});
export type TrendSignal = z.infer<typeof TrendSignalSchema>;

export const BlueprintStructureSchema = z.object({
  hookPattern: z.string(),
  beatTimings: z.array(z.number().int().nonnegative()),
  shotGrammar: z.string().nullable(),
  captionCadence: z.string().nullable(),
  textPlacement: z.string().nullable(),
  audioArchetype: z.string().nullable(),
  nicheTags: z.array(z.string()),
  velocityScore: z.number().min(0),
  sourceRef: z.string().nullable(),
});
export type BlueprintStructure = z.infer<typeof BlueprintStructureSchema>;

export const BlueprintRetrievalQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  embedding: z.array(z.number()).length(1536),
  nicheTags: z.array(z.string()),
  limit: z.number().int().min(1).max(50).default(10),
  halfLifeDays: z.number().positive().default(14),
});
export type BlueprintRetrievalQuery = z.infer<typeof BlueprintRetrievalQuerySchema>;

export const ScoredBlueprintSchema = z.object({
  id: z.string().uuid(),
  structure: BlueprintStructureSchema,
  score: z.number(),
  cosineSimilarity: z.number(),
  ageDays: z.number().nonnegative(),
});
export type ScoredBlueprint = z.infer<typeof ScoredBlueprintSchema>;
