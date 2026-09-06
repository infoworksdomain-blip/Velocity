import type { BrandProfileDraft } from "./website-intelligence";

/**
 * Concept generation provider (STEP 5/8). The stub here exists only so
 * STEP 5's onboarding flow ends in a populated (if fake) concept batch —
 * STEP 8 replaces it with the real angle-fan-out + LLM hook generation
 * pipeline behind this same interface.
 */
export interface ConceptDraft {
  hook: string;
  angleKind: string;
  format: "ai_ugc" | "slideshow" | "hook_demo" | "meme";
}

export interface ConceptGenerationProvider {
  id: string;
  generateInitialBatch(brandProfile: BrandProfileDraft): Promise<ConceptDraft[]>;
}

const STUB_DELAY_MS = 200;

export class StubConceptGenerationProvider implements ConceptGenerationProvider {
  readonly id = "stub";

  async generateInitialBatch(brandProfile: BrandProfileDraft): Promise<ConceptDraft[]> {
    await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));
    return [
      { hook: `Did you know about ${brandProfile.product}?`, angleKind: "pain_led", format: "hook_demo" },
      { hook: `POV: you just found ${brandProfile.product}`, angleKind: "pov", format: "ai_ugc" },
      { hook: `3 reasons people love ${brandProfile.product}`, angleKind: "listicle", format: "slideshow" },
    ];
  }
}
