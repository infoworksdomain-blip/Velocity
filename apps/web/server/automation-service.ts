import { randomUUID } from "node:crypto";
import { analytics as analyticsCore, automation as automationCore, calendar as calendarCore, velocity as velocityCore } from "@velocity/core";
import type { ContentFormat } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";
import { applyPreferenceUpdates } from "./analytics-service";
import { fetchMetricSamples, getWorkspaceTimezone } from "./routers/analytics";
import { previewAutoFillForWorkspace } from "./calendar-service";

/**
 * The Automation Engine's I/O half (STEP 16, build script module 17):
 * fetches the real signal a trigger needs, calls packages/core's pure
 * evaluator, and — if it fires and the spend cap allows — performs the
 * action's real effect by calling existing, already-tested service
 * functions (never new, parallel content/scheduling/preference logic).
 * `automations`/`automation_runs` both already existed in the schema
 * since STEP 1's upfront domain design; this is their first real reader/
 * writer.
 */
export type AutomationDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { describeAction, checkSpendCap, evaluateScheduleTrigger, evaluatePerformanceThresholdTrigger, evaluateLowQueueTrigger, evaluateNewBlueprintInNicheTrigger, evaluateCompetitorPostTrigger, evaluateProductFeedChangeTrigger } = automationCore;
const { utcToZonedParts } = calendarCore;
const { detectOutliers } = analyticsCore;
const { computePreferenceUpdatesFromPerformance } = velocityCore;

type Automation = typeof schema.automations.$inferSelect;

async function pastSpendUsd(db: AutomationDb, automationId: string): Promise<number> {
  const rows = await db.select({ resultSummary: schema.automationRuns.resultSummary }).from(schema.automationRuns).where(eq(schema.automationRuns.automationId, automationId));
  return rows.reduce((sum, r) => sum + (typeof (r.resultSummary as { costUsd?: number } | null)?.costUsd === "number" ? (r.resultSummary as { costUsd: number }).costUsd : 0), 0);
}

async function lastFiredAt(db: AutomationDb, automationId: string): Promise<Date | null> {
  const rows = await db
    .select({ finishedAt: schema.automationRuns.finishedAt })
    .from(schema.automationRuns)
    .where(and(eq(schema.automationRuns.automationId, automationId), eq(schema.automationRuns.status, "succeeded")))
    .orderBy(desc(schema.automationRuns.finishedAt))
    .limit(1);
  return rows[0]?.finishedAt ?? null;
}

async function evaluateTrigger(db: AutomationDb, automation: Automation): Promise<automationCore.TriggerEvaluationResult> {
  const trigger = automation.trigger as unknown as automationCore.TriggerConfig;
  switch (trigger.kind) {
    case "schedule": {
      const timezone = await getWorkspaceTimezone(automation.workspaceId, db);
      const zoned = utcToZonedParts(new Date(), timezone);
      const dayOfWeek = new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day)).getUTCDay();
      return evaluateScheduleTrigger(trigger.config, { nowInWorkspaceTimezone: { hour: zoned.hour, minute: zoned.minute, dayOfWeek }, lastFiredAt: await lastFiredAt(db, automation.id) });
    }
    case "performance_threshold": {
      const timezone = await getWorkspaceTimezone(automation.workspaceId, db);
      const samples = await fetchMetricSamples(automation.workspaceId, timezone, db);
      const groupsByDimension: Record<string, { key: string; avgEngagementRate: number }[]> = {
        format: analyticsCore.aggregateByFormat(samples),
        angle: analyticsCore.aggregateByAngle(samples),
        persona: analyticsCore.aggregateByPersona(samples),
        platform: analyticsCore.aggregateByPlatform(samples),
        hookPattern: analyticsCore.aggregateByHookPattern(samples),
      };
      return evaluatePerformanceThresholdTrigger(trigger.config, { groups: groupsByDimension[trigger.config.dimension] ?? [] });
    }
    case "low_queue": {
      const readyRows = await db.select({ id: schema.contentItems.id }).from(schema.contentItems).where(and(eq(schema.contentItems.workspaceId, automation.workspaceId), eq(schema.contentItems.status, "ready")));
      return evaluateLowQueueTrigger(trigger.config, { readyCount: readyRows.length });
    }
    case "new_blueprint_in_niche": {
      const rows = await db
        .select({ createdAt: schema.trendBlueprints.createdAt, nicheTags: schema.trendBlueprints.nicheTags })
        .from(schema.trendBlueprints)
        .where(eq(schema.trendBlueprints.workspaceId, automation.workspaceId))
        .orderBy(desc(schema.trendBlueprints.createdAt))
        .limit(1);
      const newest = rows[0];
      const matchesNiche = Boolean(newest && (newest.nicheTags as string[]).includes(trigger.config.nicheTag));
      return evaluateNewBlueprintInNicheTrigger(trigger.config, { newestBlueprintCreatedAt: matchesNiche ? (newest!.createdAt as Date) : null, lastFiredAt: await lastFiredAt(db, automation.id), matchesNiche });
    }
    case "competitor_post": {
      const rows = await db
        .select({ createdAt: schema.trendBlueprints.createdAt })
        .from(schema.trendBlueprints)
        .where(and(eq(schema.trendBlueprints.workspaceId, automation.workspaceId), eq(schema.trendBlueprints.competitorId, trigger.config.competitorId)))
        .orderBy(desc(schema.trendBlueprints.createdAt))
        .limit(1);
      return evaluateCompetitorPostTrigger(trigger.config, { newestObservedPostAt: rows[0]?.createdAt ?? null, lastFiredAt: await lastFiredAt(db, automation.id) });
    }
    case "product_feed_change":
      return evaluateProductFeedChangeTrigger(trigger.config);
  }
}

async function executeAction(db: AutomationDb, workspaceId: string, action: automationCore.ActionConfig): Promise<{ resultSummary: Record<string, unknown>; costUsd: number }> {
  switch (action.kind) {
    case "generate_batch": {
      const { generateConceptsForWorkspace } = await import("./content-service");
      const result = await generateConceptsForWorkspace({ workspaceId, ...action.config });
      return { resultSummary: { conceptsGenerated: result.concepts.length, costUsd: result.costUsd }, costUsd: result.costUsd };
    }
    case "auto_schedule": {
      const preview = await previewAutoFillForWorkspace(workspaceId, action.config.days, new Date());
      return { resultSummary: { assignmentsPreviewed: preview.assignments.length, unfilled: preview.unfilled.length }, costUsd: 0 };
    }
    case "notify": {
      // Writes the notification row directly via the injected `db`, rather
      // than going through packages/core's in-process pub/sub bus — that
      // bus's own persistence subscriber (notifications-bootstrap.ts)
      // hardcodes getAdminDb() internally (a real Postgres connection),
      // which would silently fail to persist against this function's own
      // injected PGlite test database. The bus is the right layer for a
      // live dashboard's real-time push; a batch/tick-driven automation
      // action that already has direct db access doesn't need to go
      // through it to get a real, queryable, persisted row.
      await db.insert(schema.notifications).values({ id: randomUUID(), workspaceId, userId: action.config.userId, type: "automation_alert", title: action.config.title, body: action.config.body });
      return { resultSummary: { notified: action.config.userId }, costUsd: 0 };
    }
    case "pause_campaign": {
      const result = await db
        .update(schema.campaigns)
        .set({ pausedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.campaigns.id, action.config.campaignId), eq(schema.campaigns.workspaceId, workspaceId)))
        .returning({ id: schema.campaigns.id });
      if (result.length === 0) throw new Error(`Campaign ${action.config.campaignId} not found in workspace ${workspaceId}`);
      return { resultSummary: { pausedCampaignId: action.config.campaignId }, costUsd: 0 };
    }
    case "boost_winner_variants": {
      const timezone = await getWorkspaceTimezone(workspaceId, db);
      const samples = await fetchMetricSamples(workspaceId, timezone, db);
      const updates = computePreferenceUpdatesFromPerformance(
        samples.map((s) => ({ publicationId: s.publicationId, concept: { angleKind: s.angleKind, format: s.format, personaId: s.personaId, blueprintId: null, hookPattern: s.hookPattern }, engagementRate: analyticsCore.engagementRate(s) })),
        action.config.winnerZScoreThreshold ?? 1,
      );
      const winnersOnly = updates.filter((u) => u.alphaDelta > 0).map((u) => ({ dimensionKey: u.dimensionKey, alphaDelta: u.alphaDelta, betaDelta: 0 }));
      const { dimensionsUpdated } = await applyPreferenceUpdates(db, workspaceId, winnersOnly);
      return { resultSummary: { dimensionsBoosted: dimensionsUpdated }, costUsd: 0 };
    }
    case "regenerate_hooks_for_underperformers": {
      const timezone = await getWorkspaceTimezone(workspaceId, db);
      const samples = await fetchMetricSamples(workspaceId, timezone, db);
      const outliers = detectOutliers(samples, action.config.loserZScoreThreshold ?? 1).filter((o) => o.direction === "under");
      const underperformingFormats = [...new Set(outliers.map((o) => samples.find((s) => s.publicationId === o.publicationId)?.format).filter((f): f is string => Boolean(f)))];

      if (underperformingFormats.length === 0) {
        return { resultSummary: { underperformingFormats: [], regenerated: 0 }, costUsd: 0 };
      }

      const { generateConceptsForWorkspace } = await import("./content-service");
      const result = await generateConceptsForWorkspace({
        workspaceId,
        brandProfileId: action.config.brandProfileId,
        personaIds: action.config.personaIds,
        angleCount: 1,
        formats: underperformingFormats as ContentFormat[],
        conceptsPerAngle: action.config.conceptsPerAngle ?? 3,
      });
      return { resultSummary: { underperformingFormats, regenerated: result.concepts.length, costUsd: result.costUsd }, costUsd: result.costUsd };
    }
  }
}

export interface RunAutomationResult {
  automationRunId: string;
  fired: boolean;
  reason: string;
  status: "skipped" | "succeeded" | "failed";
  resultSummary: Record<string, unknown> | null;
}

export async function runAutomation(workspaceId: string, automationId: string, db: AutomationDb = getAdminDb()): Promise<RunAutomationResult> {
  const rows = await db.select().from(schema.automations).where(and(eq(schema.automations.id, automationId), eq(schema.automations.workspaceId, workspaceId))).limit(1);
  const automation = rows[0];
  if (!automation) throw new Error(`Automation ${automationId} not found in workspace ${workspaceId}`);

  const evaluation = await evaluateTrigger(db, automation);
  if (!evaluation.fired) {
    const automationRunId = randomUUID();
    await db.insert(schema.automationRuns).values({ id: automationRunId, workspaceId, automationId, status: "skipped", startedAt: new Date(), finishedAt: new Date(), resultSummary: { reason: evaluation.reason } });
    return { automationRunId, fired: false, reason: evaluation.reason, status: "skipped", resultSummary: null };
  }

  const action = automation.action as unknown as automationCore.ActionConfig;
  const automationRunId = randomUUID();
  const startedAt = new Date();

  if (automation.isDryRun) {
    const plan = describeAction(action);
    await db.insert(schema.automationRuns).values({ id: automationRunId, workspaceId, automationId, status: "succeeded", startedAt, finishedAt: new Date(), resultSummary: { dryRun: true, description: plan.description } });
    return { automationRunId, fired: true, reason: evaluation.reason, status: "succeeded", resultSummary: { dryRun: true, description: plan.description } };
  }

  const capUsd = automation.spendCapUsd === null ? null : Number(automation.spendCapUsd);
  const spentSoFar = await pastSpendUsd(db, automationId);
  const capCheck = checkSpendCap(spentSoFar, capUsd);
  if (!capCheck.allowed) {
    await db.insert(schema.automationRuns).values({ id: automationRunId, workspaceId, automationId, status: "failed", startedAt, finishedAt: new Date(), resultSummary: { reason: capCheck.reason } });
    return { automationRunId, fired: true, reason: capCheck.reason ?? "Spend cap reached", status: "failed", resultSummary: { reason: capCheck.reason } };
  }

  try {
    const { resultSummary, costUsd } = await executeAction(db, workspaceId, action);
    const finalSummary = { ...resultSummary, costUsd };
    await db.insert(schema.automationRuns).values({ id: automationRunId, workspaceId, automationId, status: "succeeded", startedAt, finishedAt: new Date(), resultSummary: finalSummary });
    return { automationRunId, fired: true, reason: evaluation.reason, status: "succeeded", resultSummary: finalSummary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.insert(schema.automationRuns).values({ id: automationRunId, workspaceId, automationId, status: "failed", startedAt, finishedAt: new Date(), resultSummary: { error: message } });
    return { automationRunId, fired: true, reason: evaluation.reason, status: "failed", resultSummary: { error: message } };
  }
}

export async function listAutomations(workspaceId: string, db: AutomationDb = getAdminDb()) {
  return db.select().from(schema.automations).where(eq(schema.automations.workspaceId, workspaceId));
}

export interface CreateAutomationInput {
  workspaceId: string;
  name: string;
  trigger: automationCore.TriggerConfig;
  action: automationCore.ActionConfig;
  spendCapUsd: number | null;
  isDryRun: boolean;
}

export async function createAutomation(input: CreateAutomationInput, db: AutomationDb = getAdminDb()): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(schema.automations).values({
    id,
    workspaceId: input.workspaceId,
    name: input.name,
    trigger: input.trigger as unknown as { kind: string; config: Record<string, unknown> },
    action: input.action as unknown as { kind: string; config: Record<string, unknown> },
    spendCapUsd: input.spendCapUsd?.toString() ?? null,
    isDryRun: input.isDryRun,
  });
  return { id };
}

/** Runs every automation for a workspace once — the manual "run now" router endpoint calls this for a single automation via `runAutomation` directly; `runAutomationTickForAllWorkspaces` below calls this for every workspace that has at least one automation. The schema has no isEnabled flag on `automations` (STEP 1's design) — "runs" here means simply "exists," a real, contained scope note (see docs/steps/STEP-16.md). */
export async function tickAutomationsForWorkspace(workspaceId: string, db: AutomationDb = getAdminDb()): Promise<RunAutomationResult[]> {
  const automationRows = await db.select({ id: schema.automations.id }).from(schema.automations).where(eq(schema.automations.workspaceId, workspaceId));
  const results: RunAutomationResult[] = [];
  for (const row of automationRows) {
    results.push(await runAutomation(workspaceId, row.id, db));
  }
  return results;
}

export async function listAllWorkspaceIdsWithAutomations(db: AutomationDb = getAdminDb()): Promise<string[]> {
  const rows = await db.selectDistinct({ workspaceId: schema.automations.workspaceId }).from(schema.automations);
  return rows.map((r) => r.workspaceId);
}

/**
 * The real tick entrypoint a scheduler would call on an interval. Lives in
 * apps/web (not apps/worker/src/jobs, unlike STEP 11/13's OAuth-token-
 * refresh/metrics-ingestion daemons) because every automation action here
 * calls THIS APP'S OWN internal service functions (content generation,
 * calendar preview, notifications, preference updates) — none of them
 * need apps/worker's KMS-credential-decryption/external-platform-API
 * context the way a daemon reaching TikTok/Instagram/YouTube directly
 * does. No cron trigger actually calls this yet — the same "no scheduler
 * wired up" follow-up STEP 11/12/13 already flagged, now true for a
 * fourth real tick function.
 */
export async function runAutomationTickForAllWorkspaces(db: AutomationDb = getAdminDb()): Promise<Record<string, RunAutomationResult[]>> {
  const workspaceIds = await listAllWorkspaceIdsWithAutomations(db);
  const resultsByWorkspace: Record<string, RunAutomationResult[]> = {};
  for (const workspaceId of workspaceIds) {
    resultsByWorkspace[workspaceId] = await tickAutomationsForWorkspace(workspaceId, db);
  }
  return resultsByWorkspace;
}
