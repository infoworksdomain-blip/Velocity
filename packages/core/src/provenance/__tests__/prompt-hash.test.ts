import { describe, expect, it } from "vitest";
import { promptHash } from "../prompt-hash.js";

describe("promptHash", () => {
  it("is deterministic for identical input", () => {
    const input = { storyboard: { scenes: [{ durationMs: 1000 }] }, textPlanId: "p1", personaId: "u1", format: "meme" };
    expect(promptHash(input)).toBe(promptHash(input));
  });

  it("is insensitive to object key order (canonical JSON)", () => {
    const a = promptHash({ storyboard: { b: 1, a: 2 }, textPlanId: "p1", personaId: null, format: "meme" });
    const b = promptHash({ storyboard: { a: 2, b: 1 }, textPlanId: "p1", personaId: null, format: "meme" });
    expect(a).toBe(b);
  });

  it("changes when the storyboard changes", () => {
    const a = promptHash({ storyboard: { scenes: [1] }, textPlanId: "p1", personaId: null, format: "meme" });
    const b = promptHash({ storyboard: { scenes: [2] }, textPlanId: "p1", personaId: null, format: "meme" });
    expect(a).not.toBe(b);
  });

  it("changes when the format changes", () => {
    const a = promptHash({ storyboard: {}, textPlanId: "p1", personaId: null, format: "meme" });
    const b = promptHash({ storyboard: {}, textPlanId: "p1", personaId: null, format: "hook_demo" });
    expect(a).not.toBe(b);
  });

  it("produces a 64-character hex sha256 digest", () => {
    const hash = promptHash({ storyboard: {}, textPlanId: null, personaId: null, format: "meme" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
