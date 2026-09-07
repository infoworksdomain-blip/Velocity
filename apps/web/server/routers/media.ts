import { schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { requireWorkspacePermission, router } from "../trpc";

/**
 * Media Library (build script 8.6): tag-based search is real and
 * DB-backed. Semantic (embedding-similarity) search is a documented seam
 * — media_assets.embedding exists (STEP 8 schema) but nothing populates
 * it yet (no real preview-image generation pipeline calls the embedder
 * for library items), so a real pgvector query has nothing to search
 * against honestly. Tag search covers the searchable requirement for now.
 */
export const mediaRouter = router({
  list: requireWorkspacePermission("content:read:workspace")
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      return getAdminDb()
        .select()
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.workspaceId, ctx.workspaceId))
        .orderBy(desc(schema.mediaAssets.createdAt))
        .limit(input.limit);
    }),

  get: requireWorkspacePermission("content:read:workspace")
    .input(z.object({ mediaAssetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await getAdminDb()
        .select()
        .from(schema.mediaAssets)
        .where(and(eq(schema.mediaAssets.id, input.mediaAssetId), eq(schema.mediaAssets.workspaceId, ctx.workspaceId)))
        .limit(1);
      const asset = rows[0];
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
      return asset;
    }),

  searchByTag: requireWorkspacePermission("content:read:workspace")
    .input(z.object({ tag: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await getAdminDb()
        .select()
        .from(schema.mediaAssets)
        .where(eq(schema.mediaAssets.workspaceId, ctx.workspaceId));
      // jsonb array containment filtered in application code — the tag
      // vocabulary is small enough at this stage that a dedicated GIN
      // index + `@>` query is premature; revisit if the library grows
      // past a size where this table scan matters.
      return rows.filter((r) => (r.tags as string[]).includes(input.tag));
    }),
});
