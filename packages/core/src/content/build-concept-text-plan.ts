import { HookPatternSchema, TextPlanSchema, type HookPattern, type TextPlan } from "@velocity/text-engine";

/**
 * Closes the STEP 8.2 -> STEP 8B seam concept-generator.ts's own comment
 * flagged ("textPlanId: null — STEP 8B seam — real TextPlan persistence
 * lands with the real adapters"). STEP 8.2 already makes ONE batched
 * text-provider call for every concept's hook + 5-8 variants (build script
 * 8B.6: "far cheaper than 8 calls") — this builds a real, schema-valid
 * TextPlan from that ALREADY-PAID-FOR output, not a second LLM call. No
 * repair loop, no validation/safe-box pass: those exist to guard a full,
 * later render-time TextPlan (packages/text-engine/src/validation);
 * Tier-1's job (build script STEP 9) is only "show the user the actual
 * hook, at concept cost" — a real hook + real pattern, not a fully laid
 * out render.
 */

const FALLBACK_PATTERN: HookPattern = "callout";

function coerceHookPattern(raw: string): HookPattern {
  const parsed = HookPatternSchema.safeParse(raw);
  return parsed.success ? parsed.data : FALLBACK_PATTERN;
}

export interface ConceptHookVariant {
  text: string;
  pattern: string;
  predictedCtr: number;
}

export interface BuildConceptTextPlanInput {
  /** Placeholder — no content_item exists yet at Tier-1 (build script: "any design that renders before the swipe has unworkable unit economics"). Real usage never reads this field off the stored JSON; the authoritative link is always content_items.textPlanId -> text_plans.id. Documented, not a bug — see apps/worker's compose-text.ts for the same established pattern (uses textPlanId as this field's value too). */
  placeholderContentItemId: string;
  hook: string;
  variants: ConceptHookVariant[];
  ctaText: string;
}

export interface ConceptTextPlanResult {
  textPlan: TextPlan;
  hookPattern: HookPattern;
}

export function buildConceptTextPlan(input: BuildConceptTextPlanInput): ConceptTextPlanResult {
  const hookPattern = coerceHookPattern(input.variants[0]?.pattern ?? "");

  const textPlan: TextPlan = {
    version: "1.0",
    contentItemId: input.placeholderContentItemId,
    platformVariants: ["tiktok"],
    hook: { text: input.hook, spoken: true, pattern: hookPattern, emphasis: [] },
    hookVariants: input.variants.slice(0, 8).map((v) => ({
      text: v.text,
      pattern: coerceHookPattern(v.pattern),
      predictedCtr: v.predictedCtr,
    })),
    overlays: [
      {
        id: "ov_hook",
        role: "hook",
        text: input.hook,
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
    cta: { text: input.ctaText, startMs: 0, endMs: 0 },
    slideTexts: [],
    compliance: { aiDisclosureRequired: true, claimsChecked: false },
  };

  return { textPlan: TextPlanSchema.parse(textPlan), hookPattern };
}
