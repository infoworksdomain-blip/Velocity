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
  /** The chosen hook's pattern (e.g. "curiosity_gap") — a STEP 9 Velocity-bandit arm dimension. Nullable: only populated when `textPlan` below is (STEP 8B's real/stub text-engine ran for this concept). */
  hookPattern: z.string().nullable(),
  storyboard: StoryboardSchema,
  textPlanId: z.string().uuid().nullable(),
  /**
   * A real, schema-valid TextPlan object (see @velocity/text-engine's
   * TextPlanSchema — kept as an opaque JSON record here, not that
   * package's own type, so this contracts package never needs to depend
   * on text-engine) built from the SAME hook+variants this batch already
   * paid for (STEP 8B.6: one batched call, not N). Null only when no text
   * provider ran (a legacy/degraded path). The persistence layer
   * (apps/web's content-service.ts) writes this into a real `text_plans`
   * row instead of leaving `textPlanId` null pending a placeholder.
   */
  textPlan: z.record(z.string(), z.unknown()).nullable(),
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
