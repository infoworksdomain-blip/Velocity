import { z } from "zod";

/**
 * Content Engine contracts (STEP 8.2). Pure Zod + inferred types only — no
 * Node builtins, no DB imports. The Temporal workflow bundle (apps/worker)
 * imports these directly and must stay deterministic and webpack-bundleable.
 */

export const ContentFormatSchema = z.enum(["ai_ugc", "slideshow", "hook_demo", "meme"]);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

export const AngleKindSchema = z.enum([
  "pain_led",
  "transformation",
  "comparison",
  "myth_bust",
  "pov",
  "listicle",
  "founder_story",
  "social_proof",
  "objection_handling",
  "meme",
]);
export type AngleKind = z.infer<typeof AngleKindSchema>;

export const AngleDraftSchema = z.object({
  kind: AngleKindSchema,
  description: z.string().min(1),
});
export type AngleDraft = z.infer<typeof AngleDraftSchema>;

/** Mirrors storyboards.scenes' jsonb $type in packages/db/src/schema/content-production.ts exactly. */
export const StoryboardSceneSchema = z.object({
  durationMs: z.number().int().positive(),
  visualDirective: z.string().min(1),
  onScreenText: z.string().optional(),
  voiceoverLine: z.string().optional(),
  bRollQuery: z.string().optional(),
  transition: z.string().optional(),
});
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

export const StoryboardSchema = z.object({
  scenes: z.array(StoryboardSceneSchema).min(1),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

export const ConceptDraftSchema = z.object({
  angleKind: AngleKindSchema,
  format: ContentFormatSchema,
  personaId: z.string().uuid().nullable(),
  blueprintId: z.string().uuid().nullable(),
  hook: z.string().min(1).max(60),
  storyboard: StoryboardSchema,
  textPlanId: z.string().uuid().nullable(),
  previewAssetStorageKey: z.string().nullable(),
  predictedScore: z.number().min(0).max(1),
  aiGenerated: z.literal(true),
});
export type ConceptDraft = z.infer<typeof ConceptDraftSchema>;

export const ConceptBatchRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  brandProfileId: z.string().uuid(),
  angleCount: z.number().int().min(1).max(20),
  formats: z.array(ContentFormatSchema).min(1),
  conceptsPerAngle: z.number().int().min(1).max(10),
  platform: z.enum(["tiktok", "instagram", "youtube"]),
});
export type ConceptBatchRequest = z.infer<typeof ConceptBatchRequestSchema>;

export const ConceptBatchResultSchema = z.object({
  concepts: z.array(ConceptDraftSchema),
  costUsd: z.number().nonnegative(),
  usageEventIds: z.array(z.string().uuid()),
});
export type ConceptBatchResult = z.infer<typeof ConceptBatchResultSchema>;
