import { z } from "zod";
import { PlatformSchema } from "./primitives.js";

/**
 * The publish pipeline's contracts (STEP 12): preflight -> mediaStage ->
 * platformInit -> upload -> poll -> confirm -> record, the literal step
 * names from the build script. Mirrors render.ts's role for the render
 * pipeline — the Temporal workflow bundle imports only this file (plus
 * @temporalio/workflow), never db/provider types directly.
 */

export const PUBLICATION_STEP_KINDS = ["preflight", "media_stage", "platform_init", "upload", "poll", "confirm", "record"] as const;
export const PublicationStepKindSchema = z.enum(PUBLICATION_STEP_KINDS);
export type PublicationStepKind = z.infer<typeof PublicationStepKindSchema>;

export const PublishWorkflowInputSchema = z.object({
  publicationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  contentItemId: z.string().uuid(),
  renderId: z.string().uuid(),
  socialAccountId: z.string().uuid(),
  platform: PlatformSchema,
  idempotencyKey: z.string().min(1),
  requestedByUserId: z.string().uuid(),
});
export type PublishWorkflowInput = z.infer<typeof PublishWorkflowInputSchema>;

/**
 * The three-way split the build script's own failure taxonomy names:
 * transient (retry with backoff — Temporal's own activity retry policy),
 * terminal (surface with a specific remedy — fail the workflow), quota
 * (auto-reschedule to the next free slot — STEP 12 records this outcome;
 * the actual re-scheduling trigger is a scheduler-side follow-up, see
 * docs/steps/STEP-12.md).
 */
export const PublishFailureKindSchema = z.enum(["transient", "terminal", "quota"]);
export type PublishFailureKind = z.infer<typeof PublishFailureKindSchema>;

export const PreflightResultSchema = z.object({
  passed: z.boolean(),
  failureKind: PublishFailureKindSchema.nullable(),
  reasons: z.array(z.string()),
  mediaUrl: z.string().nullable(),
});
export type PreflightResult = z.infer<typeof PreflightResultSchema>;

export const PlatformPublishHandleSchema = z.object({
  externalJobId: z.string(),
  uploadTarget: z.string().nullable(),
});
export type PlatformPublishHandle = z.infer<typeof PlatformPublishHandleSchema>;

export const PublishPollStateSchema = z.enum(["processing", "succeeded", "failed"]);
export type PublishPollState = z.infer<typeof PublishPollStateSchema>;

export const PublishPollResultSchema = z.object({
  state: PublishPollStateSchema,
  platformPostId: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type PublishPollResult = z.infer<typeof PublishPollResultSchema>;

export const PublishResultSchema = z.object({
  publicationId: z.string().uuid(),
  status: z.enum(["published", "failed"]),
  platformPostId: z.string().nullable(),
  aiLabelSet: z.boolean(),
  failureKind: PublishFailureKindSchema.nullable(),
  errorMessage: z.string().nullable(),
});
export type PublishResult = z.infer<typeof PublishResultSchema>;
