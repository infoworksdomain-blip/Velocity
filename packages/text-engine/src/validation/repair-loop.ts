import { TextPlanSchema, type TextPlan } from "../text-plan.schema.js";
import { binarySearchFontSize, fitsWithinBox, type TextMeasurer } from "../layout/auto-fit.js";
import type { BoundingBox } from "../layout/safe-areas.js";
import type { TextProvider } from "../types.js";
import type { BrandRulesInput } from "../prompt/build-prompt.js";
import { checkBrandRules, classifySafety } from "./brand-safety-checks.js";

/** Local copy, not imported from @velocity/providers: that package now depends on @velocity/text-engine for the router-compatible TextProvider type (STEP 8B), so the reverse import would be circular. Three lines; not worth a shared package for. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export interface EmbedderLike {
  embed(texts: string[]): Promise<number[][]>;
}

export interface ValidationContext {
  brandRules: BrandRulesInput | null;
  competitors: string[];
  hookHistoryEmbeddings: number[][];
  embedder: EmbedderLike;
  safeBox: BoundingBox;
  getFontSizeRange: (stylePreset: string) => { minFontSizePx: number; maxFontSizePx: number };
  measurer: TextMeasurer;
}

export type ValidationStage = "schema" | "length_fit" | "brand_rules" | "safety" | "duplicate";

export interface ValidationIssue {
  stage: ValidationStage;
  detail: string;
}

export const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;

/** Checks that don't need database/embedder I/O — schema shape and the real text-measurement fit check (8B.4 steps 1-2). Split out from checkAsync so a caller with no embedder/history handy (e.g. a template-fallback sanity check) can still run the cheap, synchronous half. */
export function checkSync(raw: unknown, ctx: Pick<ValidationContext, "safeBox" | "getFontSizeRange" | "measurer">): { issues: ValidationIssue[]; plan: TextPlan | null } {
  const parsed = TextPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      plan: null,
      issues: parsed.error.errors.map((e) => ({ stage: "schema" as const, detail: `${e.path.join(".")}: ${e.message}` })),
    };
  }
  const plan = parsed.data;
  const issues: ValidationIssue[] = [];

  const checkFits = (text: string, maxLines: number, stylePreset: string, label: string) => {
    const { minFontSizePx, maxFontSizePx } = ctx.getFontSizeRange(stylePreset);
    const width = ctx.safeBox.right - ctx.safeBox.left;
    const height = ctx.safeBox.bottom - ctx.safeBox.top;
    const result = binarySearchFontSize(
      { text, maxLines, boxWidthPx: width, boxHeightPx: height, minFontSizePx, maxFontSizePx },
      ctx.measurer,
    );
    if (!fitsWithinBox(result, { text, maxLines, boxWidthPx: width, boxHeightPx: height, minFontSizePx, maxFontSizePx }, ctx.measurer)) {
      issues.push({
        stage: "length_fit",
        detail: `${label} "${text}" does not fit ${maxLines} line(s) within the safe box even at ${minFontSizePx}px`,
      });
    }
  };

  checkFits(plan.hook.text, 2, "caption_box", "hook");
  for (const overlay of plan.overlays) {
    checkFits(overlay.text, overlay.maxLines, overlay.stylePreset, `overlay ${overlay.id}`);
  }

  return { issues, plan };
}

/** The database/embedder-dependent checks (8B.4 steps 3-5): brand rules, safety, and duplicate detection against publish history. */
export async function checkAsync(plan: TextPlan, ctx: ValidationContext): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const textsToCheck = [plan.hook.text, plan.cta.text, ...plan.overlays.map((o) => o.text)];

  if (ctx.brandRules) {
    for (const text of textsToCheck) {
      for (const violation of checkBrandRules(text, ctx.brandRules)) {
        issues.push({ stage: "brand_rules", detail: `"${text}": ${violation.kind} (${violation.detail})` });
      }
    }
  }

  for (const text of textsToCheck) {
    const verdict = classifySafety(text, ctx.competitors);
    if (!verdict.passed) {
      issues.push({ stage: "safety", detail: `"${text}": flagged [${verdict.flaggedCategories.join(", ")}] on ${verdict.matchedTerms.join(", ")}` });
    }
  }

  if (ctx.hookHistoryEmbeddings.length > 0) {
    const [hookEmbedding] = await ctx.embedder.embed([plan.hook.text]);
    if (hookEmbedding) {
      const maxSimilarity = Math.max(...ctx.hookHistoryEmbeddings.map((h) => cosineSimilarity(hookEmbedding, h)));
      if (maxSimilarity > DUPLICATE_SIMILARITY_THRESHOLD) {
        issues.push({ stage: "duplicate", detail: `hook is ${(maxSimilarity * 100).toFixed(1)}% similar to a hook already in the last 200 published (threshold ${DUPLICATE_SIMILARITY_THRESHOLD * 100}%)` });
      }
    }
  }

  return issues;
}

export function buildRepairSystemPrompt(originalSystem: string, issues: ValidationIssue[]): string {
  return [
    originalSystem,
    "",
    "Your previous attempt failed validation. Fix EXACTLY these violations and return a complete, corrected result — do not repeat the same mistakes:",
    ...issues.map((issue) => `- [${issue.stage}] ${issue.detail}`),
  ].join("\n");
}

/**
 * A minimal, always-schema-valid TextPlan built from deterministic rules,
 * not the model — the "deterministic template fallback" of 8B.4 step 1.
 * Used only after the repair call still fails; safe by construction
 * (short, generic, no claims, no banned content) rather than good copy.
 */
export function buildTemplateFallback(input: { contentItemId: string; platform: "tiktok" | "reels" | "shorts"; angleDescription: string; ctaText: string }): TextPlan {
  const hookText = `Here's ${input.angleDescription}`.slice(0, 60);
  return {
    version: "1.0",
    contentItemId: input.contentItemId,
    platformVariants: [input.platform],
    hook: { text: hookText, spoken: true, pattern: "callout", emphasis: [] },
    hookVariants: Array.from({ length: 5 }, (_, i) => ({
      text: `${hookText}${i > 0 ? ` (${i + 1})` : ""}`.slice(0, 60),
      pattern: "callout" as const,
      predictedCtr: 0.03,
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
    cta: { text: input.ctaText, startMs: 0, endMs: 0 },
    slideTexts: [],
    compliance: { aiDisclosureRequired: true, claimsChecked: false },
  };
}

export interface RunRepairLoopArgs {
  textProvider: TextProvider;
  originalSystem: string;
  originalInput: string;
  schema: unknown;
  maxTokens: number;
  temperature: number;
  rawFirstAttempt: unknown;
  ctx: ValidationContext;
  templateFallback: () => TextPlan;
}

export interface RunRepairLoopResult {
  plan: TextPlan;
  usedTemplateFallback: boolean;
  repairAttempted: boolean;
  firstAttemptIssues: ValidationIssue[];
  finalIssues: ValidationIssue[];
  costUsd: number;
}

/**
 * The full 8B.4 pipeline: schema+fit check -> (if issues) exactly one
 * repair call quoting the violations -> re-check everything -> (if still
 * failing) deterministic template. "Exactly one" matches the spec's "fail
 * -> one repair call ... -> fail again -> deterministic template fallback"
 * — this is not a retry-until-success loop, by design: an LLM that fails
 * validation twice in a row on the same input is unlikely to succeed on a
 * third identical-shaped attempt, and GATE 8B's ≥95% recovery target is
 * measured against this exact one-repair-call policy, not an unbounded one.
 */
export async function runRepairLoop(args: RunRepairLoopArgs): Promise<RunRepairLoopResult> {
  let costUsd = 0;

  const firstSync = checkSync(args.rawFirstAttempt, args.ctx);
  const firstAsyncIssues = firstSync.plan ? await checkAsync(firstSync.plan, args.ctx) : [];
  const firstAttemptIssues = [...firstSync.issues, ...firstAsyncIssues];

  if (firstAttemptIssues.length === 0 && firstSync.plan) {
    return { plan: firstSync.plan, usedTemplateFallback: false, repairAttempted: false, firstAttemptIssues: [], finalIssues: [], costUsd };
  }

  const repairSystem = buildRepairSystemPrompt(args.originalSystem, firstAttemptIssues);
  const repairResult = await args.textProvider.generateStructured<unknown, unknown>({
    system: repairSystem,
    input: args.originalInput,
    schema: args.schema,
    maxTokens: args.maxTokens,
    temperature: Math.min(args.temperature, 0.3), // lower temperature on repair — this is a constraint-satisfaction pass, not a creative one (8B.1's own guidance for compliance rewrites, applied here too)
  });
  costUsd += repairResult.costUsd;

  const repairedSync = checkSync(repairResult.data, args.ctx);
  const repairedAsyncIssues = repairedSync.plan ? await checkAsync(repairedSync.plan, args.ctx) : [];
  const finalIssues = [...repairedSync.issues, ...repairedAsyncIssues];

  if (finalIssues.length === 0 && repairedSync.plan) {
    return { plan: repairedSync.plan, usedTemplateFallback: false, repairAttempted: true, firstAttemptIssues, finalIssues: [], costUsd };
  }

  return { plan: args.templateFallback(), usedTemplateFallback: true, repairAttempted: true, firstAttemptIssues, finalIssues, costUsd };
}
