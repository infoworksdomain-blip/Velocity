/**
 * Website Intelligence provider (STEP 5/6). `StubWebsiteIntelligenceProvider`
 * exists only so STEP 5's onboarding flow has something to call — it does
 * not crawl anything and its timing is meaningless. STEP 6 replaces it
 * with a real Playwright-based crawler + LLM extraction adapter behind
 * this same interface (ADR 0004's pattern), including the SSRF defenses
 * and prompt-injection handling that step specifies.
 */
export interface BrandProfileDraft {
  product: string;
  category: string;
  oneLiner: string;
  icpSegments: string[];
  pains: string[];
  benefits: string[];
}

export interface WebsiteIntelligenceProvider {
  id: string;
  analyze(url: string): Promise<BrandProfileDraft>;
}

const STUB_DELAY_MS = 200;

export class StubWebsiteIntelligenceProvider implements WebsiteIntelligenceProvider {
  readonly id = "stub";

  async analyze(url: string): Promise<BrandProfileDraft> {
    await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));
    return {
      product: "Unknown product",
      category: "General",
      oneLiner: `A business at ${url}`,
      icpSegments: ["general audience"],
      pains: ["not yet analyzed — STEP 6 replaces this stub with a real crawler"],
      benefits: ["not yet analyzed — STEP 6 replaces this stub with a real crawler"],
    };
  }
}
