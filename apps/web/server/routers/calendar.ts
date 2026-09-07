import { randomUUID } from "node:crypto";
import { calendar as calendarCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { getAdminDb } from "../db";
import { requireWorkspacePermission, router } from "../trpc";

const { loadPlatformCapsConfig, capFor } = calendarCore;

/** Same CWD-relative-path-with-env-override pattern as config/providers.json (STEP 8) and config/safe-areas.json (STEP 8B). */
function platformCapsConfigPath(): string {
  return process.env.VELOCITY_PLATFORM_CAPS_CONFIG ?? "config/platform-caps.json";
}

const PERMISSION = "calendar:manage:workspace";

export const calendarRouter = router({
  slots: router({
    list: requireWorkspacePermission(PERMISSION)
      .input(z.object({ startsAt: z.string().datetime(), endsAt: z.string().datetime() }))
      .query(async ({ ctx, input }) => {
        const db = getAdminDb();
        const rows = await db
          .select({
            slot: schema.calendarSlots,
            contentItemStatus: schema.contentItems.status,
            hook: schema.contentConcepts.hook,
            format: schema.contentConcepts.format,
            accountHandle: schema.socialAccounts.handle,
          })
          .from(schema.calendarSlots)
          .leftJoin(schema.contentItems, eq(schema.contentItems.id, schema.calendarSlots.contentItemId))
          .leftJoin(schema.contentConcepts, eq(schema.contentConcepts.id, schema.contentItems.contentConceptId))
          .leftJoin(schema.socialAccounts, eq(schema.socialAccounts.id, schema.calendarSlots.socialAccountId))
          .where(
            and(
              eq(schema.calendarSlots.workspaceId, ctx.workspaceId),
              isNull(schema.calendarSlots.deletedAt),
              gte(schema.calendarSlots.scheduledAt, new Date(input.startsAt)),
              lte(schema.calendarSlots.scheduledAt, new Date(input.endsAt)),
            ),
          );
        return rows;
      }),

    /** Drag-to-reschedule. Re-checks the real C6 cap + min-spacing constraints against the NEW time before committing — a drag that would breach a cap is rejected, not silently applied (the same non-negotiable C6 rule the auto-fill algorithm itself never relaxes). */
    reschedule: requireWorkspacePermission(PERMISSION)
      .input(z.object({ slotId: z.string().uuid(), newScheduledAt: z.string().datetime() }))
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();
        const slotRows = await db.select().from(schema.calendarSlots).where(and(eq(schema.calendarSlots.id, input.slotId), eq(schema.calendarSlots.workspaceId, ctx.workspaceId))).limit(1);
        const slot = slotRows[0];
        if (!slot) throw new TRPCError({ code: "NOT_FOUND", message: "Calendar slot not found" });
        if (!slot.socialAccountId) throw new TRPCError({ code: "BAD_REQUEST", message: "Slot has no social account" });

        const newTime = new Date(input.newScheduledAt);
        const capsConfig = loadPlatformCapsConfig(platformCapsConfigPath());
        const cap = capFor(capsConfig, slot.platform);

        const siblingRows = await db
          .select({ scheduledAt: schema.calendarSlots.scheduledAt })
          .from(schema.calendarSlots)
          .where(and(eq(schema.calendarSlots.socialAccountId, slot.socialAccountId), isNull(schema.calendarSlots.deletedAt), ne(schema.calendarSlots.id, slot.id)));

        const windowStartMs = newTime.getTime() - cap.windowHours * 3600000;
        const countInWindow = siblingRows.filter((s) => s.scheduledAt.getTime() > windowStartMs && s.scheduledAt.getTime() <= newTime.getTime()).length;
        if (countInWindow >= cap.postsPerRollingWindow) {
          throw new TRPCError({ code: "CONFLICT", message: `Rescheduling here would breach ${slot.platform}'s ${cap.postsPerRollingWindow}-post/${cap.windowHours}h cap` });
        }
        const spacingMs = cap.minSpacingMinutes * 60000;
        if (siblingRows.some((s) => Math.abs(s.scheduledAt.getTime() - newTime.getTime()) < spacingMs)) {
          throw new TRPCError({ code: "CONFLICT", message: `Rescheduling here is within ${cap.minSpacingMinutes} minutes of another scheduled post on this account` });
        }

        await db.update(schema.calendarSlots).set({ scheduledAt: newTime }).where(eq(schema.calendarSlots.id, slot.id));
        return { ok: true };
      }),

    bulkDelete: requireWorkspacePermission(PERMISSION)
      .input(z.object({ slotIds: z.array(z.string().uuid()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();
        for (const slotId of input.slotIds) {
          const slotRows = await db.select().from(schema.calendarSlots).where(and(eq(schema.calendarSlots.id, slotId), eq(schema.calendarSlots.workspaceId, ctx.workspaceId))).limit(1);
          const slot = slotRows[0];
          if (!slot) continue;
          await db.update(schema.calendarSlots).set({ deletedAt: new Date() }).where(eq(schema.calendarSlots.id, slotId));
          if (slot.contentItemId) {
            await db.update(schema.contentItems).set({ status: "ready" }).where(eq(schema.contentItems.id, slot.contentItemId));
          }
        }
        return { deleted: input.slotIds.length };
      }),
  }),

  campaigns: router({
    list: requireWorkspacePermission(PERMISSION).query(async ({ ctx }) => {
      return getAdminDb().select().from(schema.campaigns).where(and(eq(schema.campaigns.workspaceId, ctx.workspaceId), isNull(schema.campaigns.deletedAt)));
    }),
    create: requireWorkspacePermission(PERMISSION)
      .input(z.object({ name: z.string().min(1), startsAt: z.string().datetime().nullable(), endsAt: z.string().datetime().nullable() }))
      .mutation(async ({ ctx, input }) => {
        const id = randomUUID();
        await getAdminDb()
          .insert(schema.campaigns)
          .values({ id, workspaceId: ctx.workspaceId, name: input.name, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null });
        return { campaignId: id };
      }),
  }),

  autoFill: router({
    /** Computes the proposed 30-day fill WITHOUT writing anything — "present as a diff the user approves before commit" (build script). */
    preview: requireWorkspacePermission(PERMISSION)
      .input(z.object({ days: z.number().int().min(1).max(60).default(30), startsAt: z.string().datetime() }))
      .mutation(async ({ ctx, input }) => {
        const { previewAutoFillForWorkspace } = await import("../calendar-service");
        return previewAutoFillForWorkspace(ctx.workspaceId, input.days, new Date(input.startsAt));
      }),

    /** Commits a previously-previewed diff — real inserts, real content_items.status transitions to "scheduled". Takes the assignments back as input rather than re-running the algorithm, so what gets committed is EXACTLY what the user reviewed, not a fresh (possibly different, if content changed in between) computation. */
    commit: requireWorkspacePermission(PERMISSION)
      .input(z.object({ assignments: z.array(z.object({ contentItemId: z.string().uuid(), socialAccountId: z.string().uuid(), scheduledAtUtc: z.string().datetime() })) }))
      .mutation(async ({ ctx, input }) => {
        const db = getAdminDb();
        let committed = 0;
        for (const assignment of input.assignments) {
          const accountRows = await db.select({ platform: schema.socialAccounts.platform }).from(schema.socialAccounts).where(and(eq(schema.socialAccounts.id, assignment.socialAccountId), eq(schema.socialAccounts.workspaceId, ctx.workspaceId))).limit(1);
          const platform = accountRows[0]?.platform;
          if (!platform) continue;

          await db.insert(schema.calendarSlots).values({
            id: randomUUID(),
            workspaceId: ctx.workspaceId,
            platform,
            socialAccountId: assignment.socialAccountId,
            scheduledAt: new Date(assignment.scheduledAtUtc),
            contentItemId: assignment.contentItemId,
          });
          await db.update(schema.contentItems).set({ status: "scheduled" }).where(and(eq(schema.contentItems.id, assignment.contentItemId), eq(schema.contentItems.workspaceId, ctx.workspaceId)));
          committed++;
        }
        return { committed };
      }),
  }),
});
