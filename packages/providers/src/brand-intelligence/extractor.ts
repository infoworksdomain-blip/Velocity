import type { BrandProfileDraft } from "../website-intelligence";
import type { CrawledPage } from "./prompt";

export interface BrandProfileExtractor {
  id: string;
  extract(pages: CrawledPage[]): Promise<BrandProfileDraft>;
}

/**
 * Schema-valid output from superficial signals (title, meta description)
 * only — never genuine understanding of the business. The real adapter
 * needs a live Anthropic/OpenAI call using STEP 8B's structured-output
 * machinery (forced tool-use / strict JSON schema) and a funded API key —
 * a credential decision for the user to make, not invented here.
 */
export class StubBrandProfileExtractor implements BrandProfileExtractor {
  readonly id = "stub";

  async extract(pages: CrawledPage[]): Promise<BrandProfileDraft> {
    const homePage = pages[0];
    const product = homePage?.title || "Unknown product";
    const oneLiner = homePage?.metaDescription || `A business found at ${homePage?.url ?? "an unknown URL"}`;
    return {
      product,
      category: "General",
      oneLiner,
      icpSegments: ["general audience"],
      pains: ["not yet analyzed — needs a real LLM extractor (STEP 8B-era adapter)"],
      benefits: ["not yet analyzed — needs a real LLM extractor (STEP 8B-era adapter)"],
    };
  }
}
