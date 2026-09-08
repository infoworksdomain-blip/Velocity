import type {
  CompetitorPostSignal,
  CompetitorPostTriggerConfig,
  LowQueueSignal,
  LowQueueTriggerConfig,
  NewBlueprintInNicheSignal,
  NewBlueprintInNicheTriggerConfig,
  PerformanceThresholdSignal,
  PerformanceThresholdTriggerConfig,
  ProductFeedChangeTriggerConfig,
  ScheduleSignal,
  ScheduleTriggerConfig,
  TriggerEvaluationResult,
} from "./types.js";

/**
 * Pure trigger evaluators — no DB access, no dates computed internally
 * beyond what's passed in as a signal (so a fixed `now` in a test produces
 * a deterministic result, the same discipline used throughout this
 * codebase's calendar/best-time work). `automation-service.ts` fetches the
 * real signal for a given automation's trigger kind and calls the matching
 * evaluator below.
 */

/** Fires at most once per tick per configured time-of-day/day-of-week — `lastFiredAt` prevents re-firing every tick within the same matching minute. */
export function evaluateScheduleTrigger(config: ScheduleTriggerConfig, signal: ScheduleSignal, tickWindowMinutes = 5): TriggerEvaluationResult {
  const [targetHourStr, targetMinuteStr] = config.timeOfDay.split(":");
  const targetHour = Number(targetHourStr);
  const targetMinute = Number(targetMinuteStr);
  if (Number.isNaN(targetHour) || Number.isNaN(targetMinute)) {
    return { fired: false, reason: `Invalid timeOfDay "${config.timeOfDay}" — expected "HH:MM"` };
  }

  if (config.daysOfWeek && !config.daysOfWeek.includes(signal.nowInWorkspaceTimezone.dayOfWeek)) {
    return { fired: false, reason: `Today (day ${signal.nowInWorkspaceTimezone.dayOfWeek}) is not in the configured daysOfWeek` };
  }

  const targetMinutesOfDay = targetHour * 60 + targetMinute;
  const nowMinutesOfDay = signal.nowInWorkspaceTimezone.hour * 60 + signal.nowInWorkspaceTimezone.minute;
  const withinWindow = nowMinutesOfDay >= targetMinutesOfDay && nowMinutesOfDay < targetMinutesOfDay + tickWindowMinutes;
  if (!withinWindow) {
    return { fired: false, reason: `Current time ${signal.nowInWorkspaceTimezone.hour}:${signal.nowInWorkspaceTimezone.minute} is outside the ${config.timeOfDay} +${tickWindowMinutes}min firing window` };
  }

  if (signal.lastFiredAt) {
    const minutesSinceLastFire = (Date.now() - signal.lastFiredAt.getTime()) / 60000;
    if (minutesSinceLastFire < tickWindowMinutes) {
      return { fired: false, reason: "Already fired within this window" };
    }
  }

  return { fired: true, reason: `Current time is within the ${config.timeOfDay} firing window` };
}

export function evaluatePerformanceThresholdTrigger(config: PerformanceThresholdTriggerConfig, signal: PerformanceThresholdSignal): TriggerEvaluationResult {
  const breaching = signal.groups.filter((g) => (config.comparator === "below" ? g.avgEngagementRate < config.threshold : g.avgEngagementRate > config.threshold));
  if (breaching.length === 0) {
    return { fired: false, reason: `No ${config.dimension} group is ${config.comparator} ${config.threshold} avgEngagementRate` };
  }
  return { fired: true, reason: `${breaching.length} ${config.dimension} group(s) ${config.comparator} threshold: ${breaching.map((g) => g.key).join(", ")}` };
}

export function evaluateLowQueueTrigger(config: LowQueueTriggerConfig, signal: LowQueueSignal): TriggerEvaluationResult {
  if (signal.readyCount >= config.minReadyCount) {
    return { fired: false, reason: `Ready queue has ${signal.readyCount} items, at or above the configured minimum of ${config.minReadyCount}` };
  }
  return { fired: true, reason: `Ready queue has only ${signal.readyCount} items, below the configured minimum of ${config.minReadyCount}` };
}

export function evaluateNewBlueprintInNicheTrigger(config: NewBlueprintInNicheTriggerConfig, signal: NewBlueprintInNicheSignal): TriggerEvaluationResult {
  if (!signal.matchesNiche || !signal.newestBlueprintCreatedAt) {
    return { fired: false, reason: `No blueprint found matching niche "${config.nicheTag}"` };
  }
  if (signal.lastFiredAt && signal.newestBlueprintCreatedAt <= signal.lastFiredAt) {
    return { fired: false, reason: "The newest matching blueprint is not newer than the last fire" };
  }
  return { fired: true, reason: `A new blueprint matching niche "${config.nicheTag}" was found` };
}

export function evaluateCompetitorPostTrigger(config: CompetitorPostTriggerConfig, signal: CompetitorPostSignal): TriggerEvaluationResult {
  if (!signal.newestObservedPostAt) {
    return { fired: false, reason: `No observed post recorded for competitor ${config.competitorId}` };
  }
  if (signal.lastFiredAt && signal.newestObservedPostAt <= signal.lastFiredAt) {
    return { fired: false, reason: "No new observed post since the last fire" };
  }
  return { fired: true, reason: `A new observed post was recorded for competitor ${config.competitorId}` };
}

/**
 * Always returns `fired: false` with an explicit reason — see types.ts's
 * doc comment on `ProductFeedChangeTriggerConfig`. This is a genuine
 * DEFERRED, stated in the return value itself so a caller (or a test)
 * cannot mistake it for "evaluated and found nothing," the same
 * "honest DEFERRED, not a silently-passing stub" discipline used for
 * STEP 14's TikTok/Instagram competitor scraping decision.
 */
export function evaluateProductFeedChangeTrigger(config: ProductFeedChangeTriggerConfig): TriggerEvaluationResult {
  return {
    fired: false,
    reason: `product_feed_change is not implemented — no product-feed/commerce ingestion module exists in this codebase yet (feedUrl "${config.feedUrl}" is never read). See docs/steps/STEP-16.md.`,
  };
}
