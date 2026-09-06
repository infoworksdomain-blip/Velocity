import { describe, expect, it } from "vitest";
import { StubWebsiteIntelligenceProvider } from "../website-intelligence";

describe("StubWebsiteIntelligenceProvider (STEP 5 placeholder — real crawler is STEP 6)", () => {
  it("returns a schema-shaped draft profile for any URL", async () => {
    const provider = new StubWebsiteIntelligenceProvider();
    const profile = await provider.analyze("https://example.com");
    expect(profile.product).toBeTruthy();
    expect(profile.oneLiner).toContain("https://example.com");
    expect(profile.icpSegments.length).toBeGreaterThan(0);
  });
});
