import { describe, expect, it } from "vitest";
import { StubConceptGenerationProvider } from "../concept-generation";
import { StubWebsiteIntelligenceProvider } from "../website-intelligence";

describe("StubConceptGenerationProvider (STEP 5 placeholder — real generation is STEP 8)", () => {
  it("returns a non-empty batch of schema-shaped concept drafts", async () => {
    const brandProfile = await new StubWebsiteIntelligenceProvider().analyze("https://example.com");
    const concepts = await new StubConceptGenerationProvider().generateInitialBatch(brandProfile);

    expect(concepts.length).toBeGreaterThan(0);
    for (const concept of concepts) {
      expect(concept.hook.length).toBeGreaterThan(0);
      expect(["ai_ugc", "slideshow", "hook_demo", "meme"]).toContain(concept.format);
    }
  });
});
