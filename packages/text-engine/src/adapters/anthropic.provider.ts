import Anthropic from "@anthropic-ai/sdk";
import type { GenerateStructuredArgs, GenerateStructuredResult, TextProvider, TextProviderCapabilities } from "../types.js";
import { TEXT_PLAN_JSON_SCHEMA } from "../json-schema.js";
import { calculateCostUsd } from "./pricing.js";

const TOOL_NAME = "emit_text_plan";

/**
 * The real Anthropic adapter (STEP 8B.1, ADR 0005): structured output via a
 * single forced tool call, per the build script's 8B.1 spec — define one
 * tool whose `input_schema` is the target shape, force `tool_choice` to it,
 * read the result from the `tool_use` block. This is real SDK-calling code,
 * request-shape-tested against a local mock Anthropic-compatible server
 * (see __tests__/anthropic.provider.test.ts) since there is no funded
 * Anthropic API key in this environment to call the live API — the same
 * "real code, unverified against the live vendor" boundary STEP 6 and
 * STEP 8 already draw for their own funded-credential gaps.
 */
export class AnthropicTextProvider implements TextProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    apiKey: string,
    tiers: string[],
    baseURL?: string,
  ) {
    this.client = new Anthropic({ apiKey, baseURL });
    this.capabilities = {
      commercialUse: true,
      tiers,
      // Blended estimate for the router's pre-call cost-ceiling check only
      // (see TextProviderCapabilities's doc comment) — real metering uses
      // calculateCostUsd() against the call's actual token usage.
      costPerCharacter: 0.00003,
      structuredOutputMethod: "forced_tool_use",
    };
  }

  readonly capabilities: TextProviderCapabilities;

  estimateCost(input: { characters: number }): number {
    return input.characters * this.capabilities.costPerCharacter;
  }

  async generateStructured<TSchema, TData>(args: GenerateStructuredArgs<TSchema>): Promise<GenerateStructuredResult<TData>> {
    const schema = (args.schema ?? TEXT_PLAN_JSON_SCHEMA) as Record<string, unknown>;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: args.maxTokens,
      temperature: args.temperature,
      system: args.system,
      messages: [{ role: "user", content: args.input }],
      tools: [
        {
          name: TOOL_NAME,
          description: "Emit the structured result matching the required schema. Return only this tool call, no prose.",
          input_schema: schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!toolUse) {
      throw new Error(
        `Anthropic response had no "${TOOL_NAME}" tool_use block despite forced tool_choice — stop_reason was "${response.stop_reason}"`,
      );
    }

    const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    return {
      data: toolUse.input as TData,
      usage,
      costUsd: calculateCostUsd(this.model, usage),
    };
  }
}
