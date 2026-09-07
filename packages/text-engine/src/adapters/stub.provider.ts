import type { GenerateStructuredArgs, GenerateStructuredResult, TextProvider, TextProviderCapabilities } from "../types.js";

/**
 * Deterministic stand-in for a real TextProvider, used automatically (see
 * apps/worker's context.ts factory) whenever no funded API key is
 * configured for that provider id — the same "real code exists, funded
 * credential is a separate decision" boundary this codebase already draws
 * for every video/image/TTS/transcription vendor (STEP 8) and the brand
 * extraction LLM call (STEP 6). Content-addressed: identical `input`
 * (system+user message) deterministically produces identical output, the
 * same property `DeterministicJobStore` guarantees for the other stub
 * adapters, so retries and cache-hit tests behave predictably.
 *
 * Produces schema-valid TextPlan-shaped data specifically when the caller
 * is asking for a TextPlan (detected by the presence of "hookVariants" in
 * the JSON schema passed in) — generic enough to also satisfy the narrower
 * @velocity/core StructuredTextProvider call shapes (angle/concept
 * generation) that don't ask for a TextPlan at all, by falling back to a
 * minimal echo shape for anything else.
 */
export class StubTextProvider implements TextProvider {
  readonly model = "stub-text-v1";

  constructor(
    readonly id: "anthropic" | "openai",
    tiers: string[],
  ) {
    this.capabilities = {
      commercialUse: true,
      tiers,
      costPerCharacter: 0.00001,
      structuredOutputMethod: id === "anthropic" ? "forced_tool_use" : "strict_json_schema",
    };
  }

  readonly capabilities: TextProviderCapabilities;

  estimateCost(input: { characters: number }): number {
    return input.characters * this.capabilities.costPerCharacter;
  }

  async generateStructured<TSchema, TData>(args: GenerateStructuredArgs<TSchema>): Promise<GenerateStructuredResult<TData>> {
    const inputTokens = Math.ceil(args.input.length / 4);
    const outputTokens = 120;
    const schemaLooksLikeTextPlan = JSON.stringify(args.schema ?? "").includes("hookVariants");

    let data: unknown;
    if (schemaLooksLikeTextPlan) {
      let parsedInput: { productFacts?: { product?: string } } = {};
      try {
        parsedInput = JSON.parse(args.input);
      } catch {
        // Non-JSON input (e.g. a repair call's plain-text quoting of violations) — fall back to a generic hook below.
      }
      const product = parsedInput.productFacts?.product ?? "this";
      const hookText = `Here's why ${product} is different`.slice(0, 60);
      data = {
        version: "1.0",
        contentItemId: "00000000-0000-0000-0000-000000000000",
        platformVariants: ["tiktok"],
        hook: { text: hookText, spoken: true, pattern: "curiosity_gap", emphasis: [] },
        hookVariants: Array.from({ length: 5 }, (_, i) => ({
          text: `${hookText}${i > 0 ? ` (v${i + 1})` : ""}`.slice(0, 60),
          pattern: "curiosity_gap",
          predictedCtr: 0.04 + i * 0.005,
        })),
        overlays: [
          {
            id: "ov_hook",
            role: "hook",
            text: hookText,
            startMs: 0,
            endMs: 1800,
            anchor: "upper_third",
            align: "center",
            stylePreset: "caption_box",
            maxLines: 2,
            enter: "cut",
            exit: "fade",
          },
        ],
        captionTrack: { enabled: true, stylePreset: "caption_box", wordsPerGroup: 3 },
        cta: { text: "Learn more", startMs: 0, endMs: 0 },
        slideTexts: [],
        compliance: { aiDisclosureRequired: true, claimsChecked: false },
      };
    } else {
      data = { echo: args.input.slice(0, 200) };
    }

    return {
      data: data as TData,
      usage: { inputTokens, outputTokens },
      costUsd: this.estimateCost({ characters: args.input.length }),
    };
  }
}

export function createStubTextProvider(id: "anthropic" | "openai", tiers: string[]): StubTextProvider {
  return new StubTextProvider(id, tiers);
}
