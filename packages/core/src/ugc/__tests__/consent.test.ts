import { describe, expect, it } from "vitest";
import { checkPersonaConsent } from "../consent";

describe("checkPersonaConsent", () => {
  it("allows generation when the persona does not model a real person, regardless of consent artefact", () => {
    const result = checkPersonaConsent({ modelsRealPerson: false, consentArtefactId: null }, null);
    expect(result.allowed).toBe(true);
  });

  it("blocks generation when the persona models a real person and has no consent artefact id", () => {
    const result = checkPersonaConsent({ modelsRealPerson: true, consentArtefactId: null }, null);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("no consent artefact");
  });

  it("blocks generation when a consentArtefactId is set but the artefact record wasn't found (a dangling/deleted reference)", () => {
    const result = checkPersonaConsent({ modelsRealPerson: true, consentArtefactId: "some-id" }, null);
    expect(result.allowed).toBe(false);
  });

  it("allows generation when the persona models a real person and has a real, non-expired consent artefact", () => {
    const result = checkPersonaConsent({ modelsRealPerson: true, consentArtefactId: "artefact-1" }, { id: "artefact-1", expiresAt: null }, new Date("2026-06-01"));
    expect(result.allowed).toBe(true);
  });

  it("blocks generation when the consent artefact has expired", () => {
    const result = checkPersonaConsent(
      { modelsRealPerson: true, consentArtefactId: "artefact-1" },
      { id: "artefact-1", expiresAt: new Date("2026-01-01") },
      new Date("2026-06-01"),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("allows generation when the consent artefact has a future expiry", () => {
    const result = checkPersonaConsent(
      { modelsRealPerson: true, consentArtefactId: "artefact-1" },
      { id: "artefact-1", expiresAt: new Date("2027-01-01") },
      new Date("2026-06-01"),
    );
    expect(result.allowed).toBe(true);
  });
});
