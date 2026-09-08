import type { ContentFormat } from "@velocity/contracts";

/**
 * The Automation Engine's trigger -> condition -> action model (STEP 16,
 * build script module 17). Pure types + pure evaluators live here; the
 * actual DB reads that produce a `TriggerSignal` and the actual side
 * effects an action performs live in apps/web/server/automation-service.ts
 * (the same "pure logic in packages/core, I/O in apps/web" split already
 * used throughout this codebase — calendar/auto-fill.ts, publish/
 * preflight.ts, analytics/aggregate.ts).
 */

export const TRIGGER_KINDS = ["schedule", "performance_threshold", "new_blueprint_in_niche", "low_queue", "competitor_post", "product_feed_change"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const ACTION_KINDS = ["generate_batch", "auto_schedule", "notify", "pause_campaign", "boost_winner_variants", "regenerate_hooks_for_underperformers"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface ScheduleTriggerConfig {
  /** ISO 8601 time-of-day, e.g. "09:00" — evaluated against the workspace's own timezone by the caller, mirroring calendar/best-time.ts's existing IANA-timezone discipline. */
  timeOfDay: string;
  /** 0 (Sunday) - 6 (Saturday); omitted means every day. */
  daysOfWeek?: number[];
}

export interface PerformanceThresholdTriggerConfig {
  dimension: "format" | "angle" | "persona" | "platform" | "hookPattern";
  metric: "avgEngagementRate";
  comparator: "below" | "above";
  threshold: number;
}

export interface LowQueueTriggerConfig {
  minReadyCount: number;
}

export interface NewBlueprintInNicheTriggerConfig {
  nicheTag: string;
}

export interface CompetitorPostTriggerConfig {
  competitorId: string;
}

/**
 * Honestly DEFERRED (see docs/steps/STEP-16.md): no product-feed/commerce
 * ingestion module exists anywhere in this codebase (STEP 17's `commerce`
 * module — product catalogue, cart, order capture — has not been built).
 * The type is declared for schema completeness and future wiring; its
 * evaluator in triggers.ts always returns `fired: false` with an explicit
 * reason, never silently treated as "never fires because nothing changed."
 */
export interface ProductFeedChangeTriggerConfig {
  feedUrl: string;
}

export type TriggerConfig =
  | { kind: "schedule"; config: ScheduleTriggerConfig }
  | { kind: "performance_threshold"; config: PerformanceThresholdTriggerConfig }
  | { kind: "low_queue"; config: LowQueueTriggerConfig }
  | { kind: "new_blueprint_in_niche"; config: NewBlueprintInNicheTriggerConfig }
  | { kind: "competitor_post"; config: CompetitorPostTriggerConfig }
  | { kind: "product_feed_change"; config: ProductFeedChangeTriggerConfig };

export interface TriggerEvaluationResult {
  fired: boolean;
  reason: string;
}

/** Already-fetched signal data per trigger kind — the caller (automation-service.ts) does the DB read; these evaluators are pure. */
export interface ScheduleSignal {
  nowInWorkspaceTimezone: { hour: number; minute: number; dayOfWeek: number };
  lastFiredAt: Date | null;
}

export interface PerformanceThresholdSignal {
  groups: { key: string; avgEngagementRate: number }[];
}

export interface LowQueueSignal {
  readyCount: number;
}

export interface NewBlueprintInNicheSignal {
  newestBlueprintCreatedAt: Date | null;
  lastFiredAt: Date | null;
  matchesNiche: boolean;
}

export interface CompetitorPostSignal {
  newestObservedPostAt: Date | null;
  lastFiredAt: Date | null;
}

export interface GenerateBatchActionConfig {
  brandProfileId: string;
  personaIds: string[];
  angleCount: number;
  formats: ContentFormat[];
  conceptsPerAngle: number;
}

export interface AutoScheduleActionConfig {
  days: number;
}

export interface NotifyActionConfig {
  userId: string;
  title: string;
  body: string;
}

export interface PauseCampaignActionConfig {
  campaignId: string;
}

export interface BoostWinnerVariantsActionConfig {
  winnerZScoreThreshold?: number;
}

export interface RegenerateHooksForUnderperformersActionConfig {
  brandProfileId: string;
  personaIds: string[];
  loserZScoreThreshold?: number;
  conceptsPerAngle?: number;
}

export type ActionConfig =
  | { kind: "generate_batch"; config: GenerateBatchActionConfig }
  | { kind: "auto_schedule"; config: AutoScheduleActionConfig }
  | { kind: "notify"; config: NotifyActionConfig }
  | { kind: "pause_campaign"; config: PauseCampaignActionConfig }
  | { kind: "boost_winner_variants"; config: BoostWinnerVariantsActionConfig }
  | { kind: "regenerate_hooks_for_underperformers"; config: RegenerateHooksForUnderperformersActionConfig };

export interface ActionPlan {
  actionKind: ActionKind;
  /** A human-readable description of what this action would do — surfaced verbatim in dry-run mode without executing anything. */
  description: string;
}
