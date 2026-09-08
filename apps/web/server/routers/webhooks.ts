import { webhooks as webhooksCore } from "@velocity/core";
import { z } from "zod";
import { getAdminDb } from "../db";
import { createWebhook, deleteWebhook, listDeliveries, listWebhooks, replayDelivery } from "../webhook-service";
import { requireWorkspacePermission, router } from "../trpc";

const PERMISSION = "content:create:workspace";

export const webhooksRouter = router({
  list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => listWebhooks(ctx.workspaceId, getAdminDb())),

  /** The signing secret is returned exactly once here, in the mutation's response — never again through `list`. */
  create: requireWorkspacePermission(PERMISSION)
    .input(z.object({ url: z.string().url(), events: z.array(z.enum(webhooksCore.WEBHOOK_EVENT_TYPES)).min(1) }))
    .mutation(async ({ ctx, input }) => createWebhook({ workspaceId: ctx.workspaceId, ...input }, getAdminDb())),

  delete: requireWorkspacePermission(PERMISSION)
    .input(z.object({ webhookId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteWebhook(ctx.workspaceId, input.webhookId, getAdminDb());
      return { deleted: true };
    }),

  deliveries: router({
    list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => listDeliveries(ctx.workspaceId, getAdminDb())),

    /** Build script's own literal "replay endpoint" — resets a delivery (typically exhausted) back to due-now; apps/worker's webhook-delivery-daemon.ts picks it up on its next tick. */
    replay: requireWorkspacePermission(PERMISSION)
      .input(z.object({ deliveryId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        await replayDelivery(getAdminDb(), ctx.workspaceId, input.deliveryId);
        return { replayed: true };
      }),
  }),
});
