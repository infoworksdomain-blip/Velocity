import { z } from "zod";

/**
 * Shared primitives every later contract builds on. Kept deliberately small
 * in STEP 1 — module-specific request/response schemas (concepts, TextPlan,
 * calendar, publications, etc.) arrive alongside the step that owns them.
 */

export const WorkspaceScopedSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const PlatformSchema = z.enum(["tiktok", "instagram", "youtube"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
