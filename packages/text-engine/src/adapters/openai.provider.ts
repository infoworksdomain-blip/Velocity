import OpenAI from "openai";
import type { GenerateStructuredArgs, GenerateStructuredResult, TextProvider, TextProviderCapabilities } from "../types.js";
import { TEXT_PLAN_JSON_SCHEMA } from "../json-schema.js";
import { calculateCostUsd } from "./pricing.js";

const SCHEMA_NAME = "text_plan";

/**
 * The real OpenAI adapter (STEP 8B.1, ADR 0005): structured output via the
 * Responses API's strict JSON-schema `text.format`, using the exact same
 * TEXT_PLAN_JSON_SCHEMA the Anthropic adapter wraps as a tool — this is the
 * literal mechanism GATE 8B's structural-equality test proves didn't drift
 * between the two adapters. Real SDK-calling code, request-shape-tested
 * against a local mock OpenAI-compatible server (see
 * __tests__/openai.provider.test.ts); no funded OpenAI API key exists in
 * this environment to call the live API, the same documented boundary as
 * every other funded-credential gap in this codebase.
 */
export class OpenAITextProvider implements TextProvider {
  readonly id = "openai" as const;
  private readonly client: OpenAI;

  constructor(
    readonly model: string,
    apiKey: string,
    tiers: string[],
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.capabilities = {
      commercialUse: true,
      tiers,
      costPerCharacter: 0.00002,
      structuredOutputMethod: "strict_json_schema",
    };
  }

  readonly capabilities: TextProviderCapabilities;

  estimateCost(input: { characters: number }): number {
    return input.characters * this.capabilities.costPerCharacter;
  }

  async generateStructured<TSchema, TData>(args: GenerateStructuredArgs<TSchema>): Promise<GenerateStructuredResult<TData>> {
    const schema = (args.schema ?? TEXT_PLAN_JSON_SCHEMA) as Record<string, unknown>;

    const response = await this.client.responses.create({
      model: this.model,
      max_output_tokens: args.maxTokens,
      temperature: args.temperature,
      instructions: args.system,
      input: args.input,
      text: {
        format: {
          type: "json_schema",
          name: SCHEMA_NAME,
          schema,
          strict: true,
        },
      },
    });

    const outputText = response.output_text;
    if (!outputText) {
      throw new Error(`OpenAI response had no output_text despite a strict json_schema response format — status was "${response.status}"`);
    }

    const usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
    return {
      data: JSON.parse(outputText) as TData,
      usage,
      costUsd: calculateCostUsd(this.model, usage),
    };
  }
}
