import { z } from "zod";

/**
 * The TextPlan contract (STEP 8B.2). One schema drives both the Anthropic
 * and OpenAI adapters (ADR 0005) — this is the single source of truth;
 * neither adapter may fork or hand-maintain its own copy.
 *
 * This is a contract definition only in STEP 1. The prompt construction,
 * validation/repair loop, and Remotion-consuming render pipeline arrive in
 * STEP 8B.
 */

export const HookPatternSchema = z.enum([
  "curiosity_gap",
  "contrarian",
  "pov",
  "number_list",
  "callout",
  "before_after",
  "question",
  "warning",
]);
export type HookPattern = z.infer<typeof HookPatternSchema>;

export const OverlayRoleSchema = z.enum([
  "hook",
  "beat",
  "cta",
  "sticker",
  "meme_bar",
  "lower_third",
  "slide_title",
]);

export const OverlaySchema = z.object({
  id: z.string(),
  role: OverlayRoleSchema,
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  anchor: z.enum(["top", "upper_third", "center", "lower_third", "bottom"]),
  align: z.enum(["left", "center", "right"]),
  stylePreset: z.enum([
    "caption_box",
    "white_stroke",
    "karaoke",
    "impact",
    "sticker",
    "meme_bar",
  ]),
  maxLines: z.number().int().min(1).max(2),
  enter: z.enum(["cut", "pop", "slide_up", "typewriter", "word_by_word"]),
  exit: z.enum(["cut", "fade", "slide_down"]),
});

export const HookVariantSchema = z.object({
  text: z.string().max(60),
  pattern: HookPatternSchema,
  predictedCtr: z.number().min(0).max(1),
});

export const TextPlanSchema = z.object({
  version: z.literal("1.0"),
  contentItemId: z.string().uuid(),
  platformVariants: z.array(z.enum(["tiktok", "reels", "shorts"])),
  hook: z.object({
    text: z.string().max(60),
    spoken: z.boolean(),
    pattern: HookPatternSchema,
    emphasis: z.array(
      z.object({
        tokenIndex: z.number().int().nonnegative(),
        type: z.literal("highlight"),
      }),
    ),
  }),
  hookVariants: z.array(HookVariantSchema).min(5).max(8),
  overlays: z.array(OverlaySchema),
  captionTrack: z.object({
    enabled: z.boolean(),
    stylePreset: z.string(),
    wordsPerGroup: z.number().int().min(1).max(6),
  }),
  cta: z.object({
    text: z.string(),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  }),
  slideTexts: z.array(
    z.object({
      slideIndex: z.number().int().nonnegative(),
      title: z.string(),
      body: z.string(),
    }),
  ),
  compliance: z.object({
    aiDisclosureRequired: z.boolean(),
    claimsChecked: z.boolean(),
  }),
});

export type TextPlan = z.infer<typeof TextPlanSchema>;
