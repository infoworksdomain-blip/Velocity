import { calendar as calendarCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, eq, isNull } from "drizzle-orm";
import { getAdminDb } from "./db";

const { autoFillCalendar, loadPlatformCapsConfig } = calendarCore;

function platformCapsConfigPath(): string {
  return process.env.VELOCITY_PLATFORM_CAPS_CONFIG ?? "config/platform-caps.json";
}

export interface AutoFillPreview {
  assignments: { contentItemId: string; socialAccountId: string; scheduledAtUtc: string }[];
  unfilled: { socialAccountId: string; scheduledAtUtc: string; reason: string }[];
}

/**
 * routers/calendar.ts's `autoFill.preview` logic, extracted so it has ONE
 * real implementation reused by both the router (a human reviewing the
 * diff before commit — STEP 10's own design) and STEP 14's AI Assistant
 * `schedule_content` tool. The assistant tool calls this SAME preview-
 * only path and never the `commit` path — a deliberate STEP 14 safety
 * choice (see docs/steps/STEP-14.md): letting an LLM autonomously write
 * calendar state with no human review is a real product-safety decision
 * this build declines to make silently, in the same spirit as C7's
 * human-approval-before-publish requirement even though scheduling
 * itself isn't literally what C7 gates.
 */
export async function previewAutoFillForWorkspace(workspaceId: string, days: number, startsAt: Date): Promise<AutoFillPreview> {
  const db = getAdminDb();

  const workspaceRows = await db.select({ timezone: schema.workspaces.timezone }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  const timezone = workspaceRows[0]?.timezone ?? "UTC";

  const accounts = await db.select({ id: schema.socialAccounts.id, platform: schema.socialAccounts.platform }).from(schema.socialAccounts).where(eq(schema.socialAccounts.workspaceId, workspaceId));

  const readyItems = await db
    .select({ id: schema.contentItems.id, format: schema.contentConcepts.format, angleKind: schema.angles.kind, hookPattern: schema.contentConcepts.hookPattern })
    .from(schema.contentItems)
    .innerJoin(schema.contentConcepts, eq(schema.contentConcepts.id, schema.contentItems.contentConceptId))
    .innerJoin(schema.angles, eq(schema.angles.id, schema.contentConcepts.angleId))
    .where(and(eq(schema.contentItems.workspaceId, workspaceId), eq(schema.contentItems.status, "ready")));

  const existingSlotRows = await db
    .select({ socialAccountId: schema.calendarSlots.socialAccountId, scheduledAt: schema.calendarSlots.scheduledAt })
    .from(schema.calendarSlots)
    .where(and(eq(schema.calendarSlots.workspaceId, workspaceId), isNull(schema.calendarSlots.deletedAt)));

  const campaignRows = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.workspaceId, workspaceId), isNull(schema.campaigns.deletedAt)));

  const capsConfig = loadPlatformCapsConfig(platformCapsConfigPath());

  const result = autoFillCalendar({
    workspaceTimezone: timezone,
    startDate: { year: startsAt.getUTCFullYear(), month: startsAt.getUTCMonth() + 1, day: startsAt.getUTCDate() },
    days,
    accounts: accounts.map((a) => ({ socialAccountId: a.id, platform: a.platform })),
    contentPool: readyItems.map((i) => ({ contentItemId: i.id, format: i.format, angleKind: i.angleKind, hookPattern: i.hookPattern, campaignId: null })),
    existingSlots: existingSlotRows.filter((s): s is { socialAccountId: string; scheduledAt: Date } => Boolean(s.socialAccountId)).map((s) => ({ socialAccountId: s.socialAccountId, scheduledAtUtc: s.scheduledAt })),
    campaignWindows: campaignRows.filter((c) => c.startsAt && c.endsAt).map((c) => ({ campaignId: c.id, startsAt: c.startsAt!, endsAt: c.endsAt! })),
    platformCaps: capsConfig,
  });

  return {
    assignments: result.assignments.map((a) => ({ ...a, scheduledAtUtc: a.scheduledAtUtc.toISOString() })),
    unfilled: result.unfilled.map((u) => ({ ...u, scheduledAtUtc: u.scheduledAtUtc.toISOString() })),
  };
}
