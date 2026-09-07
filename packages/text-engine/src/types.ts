/**
 * TextProvider abstraction (STEP 8B.1, ADR 0005). Interface shape only —
 * the Anthropic (forced tool-use) and OpenAI (strict JSON schema) adapters
 * are implemented in STEP 8B against this shared shape and the one TextPlan
 * schema in ./text-plan.schema.ts.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateStructuredArgs<TSchema> {
  system: string;
  input: string;
  schema: TSchema;
  maxTokens: number;
  temperature: number;
}

export interface GenerateStructuredResult<TData> {
  data: TData;
  usage: TokenUsage;
  costUsd: number;
}

/**
 * Router-compatible capability manifest (STEP 8B, extending ADR 0004's
 * router to a fifth kind: "text" — see @velocity/contracts's
 * ProviderKindSchema). `costPerCharacter` is a blended per-character
 * estimate used ONLY for the router's pre-call cost-ceiling check
 * (RouterCriteria.jobShape.characters already existed for this); the real
 * metered cost written to usage_events (C5) always comes from the actual
 * per-token usage a call returns, via PRICING in adapters/pricing.ts — the
 * router's estimate and the metered actual are deliberately different
 * numbers serving different purposes, same distinction the video/image/tts
 * adapters already draw between `estimateCost()` and a job's real
 * `costUsd`.
 */
export interface TextProviderCapabilities {
  commercialUse: true;
  tiers: string[];
  costPerCharacter: number;
  structuredOutputMethod: "forced_tool_use" | "strict_json_schema";
}

export interface TextProvider {
  id: "anthropic" | "openai";
  model: string;
  capabilities: TextProviderCapabilities;
  estimateCost(input: { characters: number }): number;
  generateStructured<TSchema, TData>(
    args: GenerateStructuredArgs<TSchema>,
  ): Promise<GenerateStructuredResult<TData>>;
}
