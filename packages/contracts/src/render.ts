import { z } from "zod";
import { ContentFormatSchema, StoryboardSchema } from "./content.js";

/**
 * The render pipeline's contracts (STEP 8.4). Everything the Temporal
 * workflow (apps/worker) passes between activities is defined here so the
 * workflow bundle has one frozen shape to import — never inline object
 * literals scattered across activity files.
 */

export const RENDER_STEP_KINDS = [
  "resolve_assets",
  "generate_shot",
  "generate_vo",
  "align",
  "compose_text",
  "compose",
  "normalise",
  "provenance",
  "qc",
  "publish_ready",
] as const;
export const RenderStepKindSchema = z.enum(RENDER_STEP_KINDS);
export type RenderStepKind = z.infer<typeof RenderStepKindSchema>;

export const RenderWorkflowInputSchema = z.object({
  renderId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  contentItemId: z.string().uuid(),
  contentConceptId: z.string().uuid(),
  format: ContentFormatSchema,
  storyboard: StoryboardSchema,
  textPlanId: z.string().uuid().nullable(),
  personaId: z.string().uuid().nullable(),
  workspaceTier: z.string(),
  costCeilingUsd: z.number().positive(),
  regenerationRound: z.number().int().min(0).max(2).default(0),
});
export type RenderWorkflowInput = z.infer<typeof RenderWorkflowInputSchema>;

export const ShotSpecSchema = z.object({
  shotIndex: z.number().int().nonnegative(),
  durationSec: z.number().positive(),
  prompt: z.string().min(1),
  referenceImageUrl: z.string().nullable(),
  resolution: z.string(),
  requiresLipSync: z.boolean(),
  requiresImageToVideo: z.boolean(),
});
export type ShotSpec = z.infer<typeof ShotSpecSchema>;

export const VoiceoverSpecSchema = z.object({
  script: z.string().min(1),
  voiceId: z.string(),
});
export type VoiceoverSpec = z.infer<typeof VoiceoverSpecSchema>;

/** One FormatPlan decides which activities a given format actually runs — a meme has no VO, a slideshow has no lip-sync. */
export const FormatPlanSchema = z.object({
  format: ContentFormatSchema,
  shots: z.array(ShotSpecSchema),
  voiceover: VoiceoverSpecSchema.nullable(),
  outputsImageSet: z.boolean(),
  targetDurationSec: z.number().positive(),
  targetResolution: z.string(),
});
export type FormatPlan = z.infer<typeof FormatPlanSchema>;

export const WordTimingSchema = z.object({
  word: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});

export const AlignmentSchema = z.object({
  words: z.array(WordTimingSchema),
});
export type Alignment = z.infer<typeof AlignmentSchema>;

export const ComposeSpecSchema = z.object({
  shotOutputRefs: z.array(z.string()),
  voiceoverOutputRef: z.string().nullable(),
  textOverlayRef: z.string().nullable(),
  targetResolution: z.string(),
  targetDurationSec: z.number().positive(),
});
export type ComposeSpec = z.infer<typeof ComposeSpecSchema>;

export const CompositionOutputSchema = z.object({
  outputStorageKey: z.string(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  hasAudio: z.boolean(),
});
export type CompositionOutput = z.infer<typeof CompositionOutputSchema>;

export const QcVerdictSchema = z.enum(["pass", "regenerate", "fail"]);
export type QcVerdict = z.infer<typeof QcVerdictSchema>;

export const QcReportSchema = z.object({
  verdict: QcVerdictSchema,
  notes: z.array(z.string()),
  safetyPassed: z.boolean(),
  bannedClaimsPassed: z.boolean(),
  duplicateCheckPassed: z.boolean(),
  durationAspectPassed: z.boolean(),
  audioPresencePassed: z.boolean(),
});
export type QcReport = z.infer<typeof QcReportSchema>;

export const ProvenanceRecordSchema = z.object({
  modelId: z.string(),
  promptHash: z.string(),
  aiGenerated: z.literal(true),
  modelWatermarkPreserved: z.boolean(),
  c2paManifestRef: z.string().nullable(),
  c2paSigned: z.boolean(),
});
export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

export const RenderResultSchema = z.object({
  renderId: z.string().uuid(),
  outputStorageKey: z.string().nullable(),
  costUsd: z.number().nonnegative(),
  qc: QcReportSchema,
  provenance: ProvenanceRecordSchema,
  status: z.enum(["succeeded", "failed"]),
});
export type RenderResult = z.infer<typeof RenderResultSchema>;
