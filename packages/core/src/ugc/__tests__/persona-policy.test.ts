import { describe, expect, it } from "vitest";
import { checkPersonaGenerationPolicy, type PersonaPolicyCheckInput } from "../persona-policy";
import type { PublicFiguresConfig } from "../public-figure-check";

const PUBLIC_FIGURES: PublicFiguresConfig = { version: 1, names: ["Elon Musk"], note: "test fixture" };

function baseInput(overrides: Partial<PersonaPolicyCheckInput> = {}): PersonaPolicyCheckInput {
  return {
    persona: { modelsRealPerson: false, consentArtefactId: null },
    consentArtefact: null,
    script: "Try our new skincare routine, it feels amazing every morning.",
    publicFiguresConfig: PUBLIC_FIGURES,
    hasApprovedManualReview: false,
    now: new Date("2026-06-01"),
    ...overrides,
  };
}

describe("checkPersonaGenerationPolicy", () => {
  it("allows a synthetic (non-real-person) persona with a clean script", () => {
    const result = checkPersonaGenerationPolicy(baseInput());
    expect(result).toEqual({ allowed: true, blockReason: null, message: null });
  });

  it("blocks first on missing consent, even if the script also has other issues (consent is the first gate)", () => {
    const result = checkPersonaGenerationPolicy(
      baseInput({
        persona: { modelsRealPerson: true, consentArtefactId: null },
        script: "This cures cancer, guaranteed.",
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toBe("consent_missing");
  });

  it("blocks on a real named public figure reference, never treating it as reviewable", () => {
    const result = checkPersonaGenerationPolicy(
      baseInput({
        script: "Watch Elon Musk endorse our product in this video.",
        hasApprovedManualReview: true,
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toBe("public_figure");
    expect(result.message).toContain("Elon Musk");
  });

  it("blocks a regulated-claim script when there is no approved manual review", () => {
    const result = checkPersonaGenerationPolicy(
      baseInput({ script: "This product guarantees weight loss and cures disease." }),
    );
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toBe("regulated_claim");
    expect(result.message).toContain("health_claim");
  });

  it("allows a regulated-claim script through when there IS an approved manual review", () => {
    const result = checkPersonaGenerationPolicy(
      baseInput({ script: "This product guarantees weight loss and cures disease.", hasApprovedManualReview: true }),
    );
    expect(result.allowed).toBe(true);
  });

  it("allows a real-person persona with valid consent and a clean script", () => {
    const result = checkPersonaGenerationPolicy(
      baseInput({
        persona: { modelsRealPerson: true, consentArtefactId: "artefact-1" },
        consentArtefact: { id: "artefact-1", expiresAt: null },
      }),
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks on an expired consent artefact before ever reaching the public-figure or regulated-claim checks", () => {
    const result = checkPersonaGenerationPolicy(
      baseInput({
        persona: { modelsRealPerson: true, consentArtefactId: "artefact-1" },
        consentArtefact: { id: "artefact-1", expiresAt: new Date("2026-01-01") },
        script: "Watch Elon Musk endorse this cure for cancer.",
        hasApprovedManualReview: true,
      }),
    );
    expect(result.blockReason).toBe("consent_missing");
  });
});
