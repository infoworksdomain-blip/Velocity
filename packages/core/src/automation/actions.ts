import type { ActionConfig, ActionPlan } from "./types.js";

/**
 * Dry-run mode's entire contract: describe what an action WOULD do without
 * doing it. The real side effects (calling generateConceptsForWorkspace,
 * writing calendar_slots, publishing a notification, setting
 * campaigns.pausedAt, applying velocity_preferences updates) live in
 * apps/web/server/automation-service.ts's `executeAction`, which calls
 * this function first, always, and returns its `description` unchanged
 * for a dry-run automation — so a dry-run and a real run are provably
 * describing the exact same planned action, not two independent code paths
 * that could drift.
 */
export function describeAction(action: ActionConfig): ActionPlan {
  switch (action.kind) {
    case "generate_batch":
      return {
        actionKind: action.kind,
        description: `Generate ${action.config.angleCount * action.config.conceptsPerAngle} concept(s) across ${action.config.angleCount} angle(s) x ${action.config.formats.length} format(s) for brand profile ${action.config.brandProfileId}`,
      };
    case "auto_schedule":
      return { actionKind: action.kind, description: `Preview a ${action.config.days}-day calendar auto-fill (preview only — an automation never commits calendar writes without human review, the same C7-spirited stance STEP 14's schedule_content tool takes)` };
    case "notify":
      return { actionKind: action.kind, description: `Notify user ${action.config.userId}: "${action.config.title}"` };
    case "pause_campaign":
      return { actionKind: action.kind, description: `Pause campaign ${action.config.campaignId}` };
    case "boost_winner_variants":
      return { actionKind: action.kind, description: `Apply real performance-derived velocity_preferences boosts to statistically winning dimensions (z >= ${action.config.winnerZScoreThreshold ?? 1})` };
    case "regenerate_hooks_for_underperformers":
      return { actionKind: action.kind, description: `Identify statistically underperforming dimensions (z <= -${action.config.loserZScoreThreshold ?? 1}) and generate ${action.config.conceptsPerAngle ?? 3} fresh replacement concept(s) for each` };
  }
}
