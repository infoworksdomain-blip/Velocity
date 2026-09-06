import { describe, expect, it } from "vitest";
import {
  isTerminalStage,
  nextOnboardingStage,
  ONBOARDING_STAGE_ORDER,
  type OnboardingStage,
} from "../state-machine";

describe("onboarding state machine", () => {
  it("walks the full happy path in the script's exact order", () => {
    let stage: OnboardingStage = "choose_type";
    stage = nextOnboardingStage(stage, { type: "TYPE_CHOSEN" });
    expect(stage).toBe("enter_url");
    stage = nextOnboardingStage(stage, { type: "URL_SUBMITTED" });
    expect(stage).toBe("analyzing");
    stage = nextOnboardingStage(stage, { type: "ANALYSIS_COMPLETE" });
    expect(stage).toBe("confirm_profile");
    stage = nextOnboardingStage(stage, { type: "PROFILE_CONFIRMED" });
    expect(stage).toBe("pick_goals");
    stage = nextOnboardingStage(stage, { type: "GOALS_PICKED" });
    expect(stage).toBe("connect_social");
    stage = nextOnboardingStage(stage, { type: "SOCIAL_CONNECTED" });
    expect(stage).toBe("done");
    expect(isTerminalStage(stage)).toBe(true);
  });

  it("connect_social can be skipped and still reaches done", () => {
    const stage = nextOnboardingStage("connect_social", { type: "SOCIAL_SKIPPED" });
    expect(stage).toBe("done");
  });

  it("an event with no valid transition from the current stage is a no-op", () => {
    // GOALS_PICKED has no meaning while still choosing a type.
    const stage = nextOnboardingStage("choose_type", { type: "GOALS_PICKED" });
    expect(stage).toBe("choose_type");
  });

  it("done has no outgoing transitions at all", () => {
    for (const eventType of [
      "TYPE_CHOSEN",
      "URL_SUBMITTED",
      "ANALYSIS_COMPLETE",
      "PROFILE_CONFIRMED",
      "GOALS_PICKED",
      "SOCIAL_CONNECTED",
      "SOCIAL_SKIPPED",
    ] as const) {
      expect(nextOnboardingStage("done", { type: eventType })).toBe("done");
    }
  });

  it("the stage order constant matches the script's sequence and has no duplicates", () => {
    expect(ONBOARDING_STAGE_ORDER).toEqual([
      "choose_type",
      "enter_url",
      "analyzing",
      "confirm_profile",
      "pick_goals",
      "connect_social",
      "done",
    ]);
    expect(new Set(ONBOARDING_STAGE_ORDER).size).toBe(ONBOARDING_STAGE_ORDER.length);
  });
});
