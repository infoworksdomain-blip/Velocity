import type { BrandProfileDraft, WebsiteIntelligenceProvider } from "../website-intelligence";
import { crawlWebsite } from "./crawler";
import { StubBrandProfileExtractor, type BrandProfileExtractor } from "./extractor";
import { buildExtractionPrompt } from "./prompt";

/**
 * Real crawler + real SSRF defenses + real injection-safe prompt
 * construction, composed behind STEP 5's WebsiteIntelligenceProvider
 * interface. Only the final extraction call is a stub (see extractor.ts).
 */
export class RealWebsiteIntelligenceProvider implements WebsiteIntelligenceProvider {
  readonly id = "real";

  constructor(private readonly extractor: BrandProfileExtractor = new StubBrandProfileExtractor()) {}

  async analyze(url: string): Promise<BrandProfileDraft> {
    const pages = await crawlWebsite(url);
    if (pages.length === 0) {
      throw new Error(`Could not crawl any page of "${url}" — check the URL is reachable and not SSRF-blocked`);
    }
    // Exercises the real prompt-construction path end to end even though
    // the stub extractor below doesn't send it anywhere yet — this is
    // exactly where a real STEP 8B-era structured-output adapter plugs in.
    buildExtractionPrompt(pages);
    return this.extractor.extract(pages);
  }
}

export * from "./crawler";
export * from "./extractor";
export * from "./prompt";
export * from "./ssrf-safe-fetch";
