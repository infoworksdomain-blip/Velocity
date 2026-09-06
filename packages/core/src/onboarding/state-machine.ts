/**
 * The onboarding stage sequence from STEP 5: choose type -> enter URL (or
 * handle) -> live progress while analysis runs -> confirm/edit profile ->
 * pick 3 goals -> connect first social (skippable) -> done. A pure
 * function so it's exhaustively testable without any backend, UI
 * framework, or the (currently stubbed) analysis/generation providers.
 */
export type OnboardingStage =
  | "choose_type"
  | "enter_url"
  | "analyzing"
  | "confirm_profile"
  | "pick_goals"
  | "connect_social"
  | "done";

export const ONBOARDING_STAGE_ORDER: readonly OnboardingStage[] = [
  "choose_type",
  "enter_url",
  "analyzing",
  "confirm_profile",
  "pick_goals",
  "connect_social",
  "done",
];

export type OnboardingEvent =
  | { type: "TYPE_CHOSEN" }
  | { type: "URL_SUBMITTED" }
  | { type: "ANALYSIS_COMPLETE" }
  | { type: "PROFILE_CONFIRMED" }
  | { type: "GOALS_PICKED" }
  | { type: "SOCIAL_CONNECTED" }
  | { type: "SOCIAL_SKIPPED" };

type TransitionTable = {
  [Stage in OnboardingStage]: Partial<Record<OnboardingEvent["type"], OnboardingStage>>;
};

const TRANSITIONS: TransitionTable = {
  choose_type: { TYPE_CHOSEN: "enter_url" },
  enter_url: { URL_SUBMITTED: "analyzing" },
  analyzing: { ANALYSIS_COMPLETE: "confirm_profile" },
  confirm_profile: { PROFILE_CONFIRMED: "pick_goals" },
  pick_goals: { GOALS_PICKED: "connect_social" },
  // Both a real connection and a skip land on "done" — connect_social is
  // explicitly skippable per the script.
  connect_social: { SOCIAL_CONNECTED: "done", SOCIAL_SKIPPED: "done" },
  done: {},
};

/** An event with no valid transition from the current stage is a no-op (returns the current stage), not an error — a stale UI re-dispatching an already-handled event shouldn't crash the flow. */
export function nextOnboardingStage(current: OnboardingStage, event: OnboardingEvent): OnboardingStage {
  return TRANSITIONS[current][event.type] ?? current;
}

export function isTerminalStage(stage: OnboardingStage): boolean {
  return stage === "done";
}
