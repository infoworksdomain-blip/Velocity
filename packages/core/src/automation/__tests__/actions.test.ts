import { describe, expect, it } from "vitest";
import { describeAction } from "../actions";
import type { ActionConfig } from "../types";

describe("describeAction", () => {
  it("describes generate_batch with the real computed concept count", () => {
    const action: ActionConfig = { kind: "generate_batch", config: { brandProfileId: "bp1", personaIds: [], angleCount: 3, formats: ["meme"], conceptsPerAngle: 2 } };
    const plan = describeAction(action);
    expect(plan.description).toContain("Generate 6 concept(s)");
    expect(plan.description).toContain("bp1");
  });

  it("describes auto_schedule as preview-only", () => {
    const action: ActionConfig = { kind: "auto_schedule", config: { days: 14 } };
    expect(describeAction(action).description).toContain("preview");
  });

  it("describes notify with the target user and title", () => {
    const action: ActionConfig = { kind: "notify", config: { userId: "u1", title: "Queue running low", body: "..." } };
    expect(describeAction(action).description).toContain("u1");
    expect(describeAction(action).description).toContain("Queue running low");
  });

  it("describes pause_campaign with the target campaign id", () => {
    const action: ActionConfig = { kind: "pause_campaign", config: { campaignId: "c1" } };
    expect(describeAction(action).description).toContain("c1");
  });

  it("describes boost_winner_variants with the configured threshold", () => {
    const action: ActionConfig = { kind: "boost_winner_variants", config: { winnerZScoreThreshold: 1.5 } };
    expect(describeAction(action).description).toContain("1.5");
  });

  it("describes regenerate_hooks_for_underperformers with the configured threshold", () => {
    const action: ActionConfig = { kind: "regenerate_hooks_for_underperformers", config: { brandProfileId: "bp1", personaIds: [], loserZScoreThreshold: 1.2, conceptsPerAngle: 5 } };
    const description = describeAction(action).description;
    expect(description).toContain("1.2");
    expect(description).toContain("5");
  });
});
