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

export interface TextProvider {
  id: "anthropic" | "openai";
  model: string;
  generateStructured<TSchema, TData>(
    args: GenerateStructuredArgs<TSchema>,
  ): Promise<GenerateStructuredResult<TData>>;
}
