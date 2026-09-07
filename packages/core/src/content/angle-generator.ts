import { AngleDraftSchema, type AngleDraft } from "@velocity/contracts";
import { z } from "zod";
import type { UsageRecorderTx } from "../metering/usage-recorder.js";
import { recordUsage } from "../metering/usage-recorder.js";

/**
 * Structural subset of @velocity/text-engine's TextProvider — angle
 * generation only needs `generateStructured`, and depending on this
 * narrow shape rather than importing the whole package keeps this module
 * testable with a plain fake, no real (or even stub) 8B adapter required.
 * STEP 8B's real Anthropic/OpenAI adapters satisfy this shape unchanged.
 */
export interface StructuredTextProvider {
  id: string;
  model: string;
  generateStructured<TData>(args: {
    system: string;
    input: string;
    schema: unknown;
    maxTokens: number;
    temperature: number;
  }): Promise<{ data: TData; usage: { inputTokens: number; outputTokens: number }; costUsd: number }>;
}

export interface GenerateAnglesDeps {
  textProvider: StructuredTextProvider;
  tx: UsageRecorderTx;
}

export interface GenerateAnglesInput {
  workspaceId: string;
  product: string;
  category: string;
  pains: string[];
  differentiators: string[];
  angleCount: number;
}

const AngleBatchSchema = z.object({ angles: z.array(AngleDraftSchema) });

export interface GenerateAnglesResult {
  angles: AngleDraft[];
  costUsd: number;
  usageEventId: string;
}

export async function generateAngles(deps: GenerateAnglesDeps, input: GenerateAnglesInput): Promise<GenerateAnglesResult> {
  const system = [
    "You generate marketing angles for short-form video content.",
    "Return ONLY the tool call — no prose.",
    `Generate exactly ${input.angleCount} distinct angles, each a different rhetorical approach (pain-led, transformation, comparison, myth-bust, POV, listicle, founder story, social proof, objection-handling, or meme).`,
  ].join(" ");

  const userInput = JSON.stringify({
    product: input.product,
    category: input.category,
    pains: input.pains,
    differentiators: input.differentiators,
  });

  const result = await deps.textProvider.generateStructured<z.infer<typeof AngleBatchSchema>>({
    system,
    input: userInput,
    schema: AngleBatchSchema,
    maxTokens: 2000,
    temperature: 0.7,
  });

  const { usageEventId } = await recordUsage(deps.tx, {
    workspaceId: input.workspaceId,
    provider: deps.textProvider.id,
    model: deps.textProvider.model,
    units: result.usage.inputTokens + result.usage.outputTokens,
    costUsd: result.costUsd,
    jobKind: "text",
  });

  // Defensive cap: the system prompt asks for exactly input.angleCount, but
  // nothing about the schema enforces a dynamic length per call — never
  // trust a model (real or stub) to exactly follow a count instruction.
  const angles = result.data.angles.slice(0, input.angleCount);

  return { angles, costUsd: result.costUsd, usageEventId };
}
