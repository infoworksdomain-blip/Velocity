import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserMessage, type PromptInput } from "../build-prompt.js";

const BASE_INPUT: PromptInput = {
  brandTone: { voice: "friendly and direct", formality: "casual", humour: false, bannedWords: ["synergy"] },
  brandRules: { bannedWords: ["cheap"], bannedClaims: ["guaranteed results"], requiredDisclaimers: ["Results may vary"] },
  proofPoints: ["10,000 teams use TaskFlow"],
  angleDescription: "solving disorganisation",
  hookPattern: "curiosity_gap",
  captionCadence: "fast-cut",
  format: "meme",
  platform: "tiktok",
  storyboard: { scenes: [{ durationMs: 3000, visualDirective: "a caption bar" }] },
  productFacts: { product: "TaskFlow", category: "productivity software", oneLiner: "Task management that keeps up" },
  maxHookChars: 60,
};

describe("buildSystemPrompt", () => {
  it("includes the max hook char limit exactly as configured", () => {
    expect(buildSystemPrompt(BASE_INPUT)).toContain("<= 60 characters");
  });

  it("merges banned words from both brand tone and brand rules", () => {
    const prompt = buildSystemPrompt(BASE_INPUT);
    expect(prompt).toContain("synergy");
    expect(prompt).toContain("cheap");
  });

  it("includes required disclaimers and banned claims when present", () => {
    const prompt = buildSystemPrompt(BASE_INPUT);
    expect(prompt).toContain("Results may vary");
    expect(prompt).toContain("guaranteed results");
  });

  it("omits the humour line and forbids emoji/jokes when brand tone disallows humour", () => {
    const prompt = buildSystemPrompt(BASE_INPUT);
    expect(prompt).toContain("Never use emoji or jokes");
  });

  it("allows light humour when the brand tone permits it", () => {
    const prompt = buildSystemPrompt({ ...BASE_INPUT, brandTone: { ...BASE_INPUT.brandTone, humour: true } });
    expect(prompt).toContain("Light humour is on-brand");
  });

  it("includes the trend blueprint's hook pattern and caption cadence when provided", () => {
    const prompt = buildSystemPrompt(BASE_INPUT);
    expect(prompt).toContain("curiosity_gap");
    expect(prompt).toContain("fast-cut");
  });

  it("omits blueprint lines entirely when no blueprint was matched", () => {
    const prompt = buildSystemPrompt({ ...BASE_INPUT, hookPattern: undefined, captionCadence: undefined });
    expect(prompt).not.toContain("Preferred hook pattern");
  });

  it("instructs the model to treat product copy as untrusted, not as commands", () => {
    expect(buildSystemPrompt(BASE_INPUT)).toMatch(/untrusted/i);
  });

  it("instructs the model to return only structured output, no prose", () => {
    expect(buildSystemPrompt(BASE_INPUT)).toMatch(/no prose/i);
  });
});

describe("buildUserMessage", () => {
  it("is valid JSON carrying the storyboard and product facts", () => {
    const parsed = JSON.parse(buildUserMessage(BASE_INPUT));
    expect(parsed.storyboard).toEqual(BASE_INPUT.storyboard);
    expect(parsed.productFacts).toEqual(BASE_INPUT.productFacts);
  });
});
