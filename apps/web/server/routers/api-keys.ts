import { z } from "zod";
import { getAdminDb } from "../db";
import { createApiKey, listApiKeys, revokeApiKey } from "../api-key-service";
import { requireWorkspacePermission, router } from "../trpc";

const PERMISSION = "content:create:workspace";

/** Public API key management (STEP 16). The raw key is returned exactly once, in `create`'s response — `list` never exposes it again. */
export const apiKeysRouter = router({
  list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => listApiKeys(ctx.workspaceId, getAdminDb())),

  create: requireWorkspacePermission(PERMISSION)
    .input(z.object({ scopes: z.array(z.string().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => createApiKey({ workspaceId: ctx.workspaceId, scopes: input.scopes }, getAdminDb())),

  revoke: requireWorkspacePermission(PERMISSION)
    .input(z.object({ apiKeyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await revokeApiKey(ctx.workspaceId, input.apiKeyId, getAdminDb());
      return { revoked: true };
    }),
});
