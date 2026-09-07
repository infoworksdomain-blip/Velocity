import { BlueprintStructureSchema, type BlueprintStructure, type TrendSignal } from "@velocity/contracts";
import { z } from "zod";
import type { UsageRecorderTx } from "../metering/usage-recorder.js";
import { recordUsage } from "../metering/usage-recorder.js";
import type { StructuredTextProvider } from "../content/angle-generator.js";

/**
 * Structure extraction from a trend signal (STEP 8.3). `TrendSignal` has
 * no media-URL field at the schema level (packages/contracts/src/trends.ts)
 * — C3 ("store structure, never source footage") is a compile-time
 * constraint here, not a code-review reminder: there is no field this
 * function could accidentally persist a playable URL into even if it
 * wanted to.
 */

export interface ExtractBlueprintDeps {
  textProvider: StructuredTextProvider;
  tx: UsageRecorderTx;
  workspaceId: string; // billed to the platform ingestion workspace, not a tenant — see docs/steps/STEP-08.md's trend-library ADR
}

export async function extractBlueprint(deps: ExtractBlueprintDeps, signal: TrendSignal): Promise<BlueprintStructure> {
  const system = [
    "You extract reusable structural patterns from short-form video trend metadata.",
    "You are never given and must never reference any video file or URL — only caption text, timing, and engagement metadata.",
    "Return ONLY the tool call — no prose.",
  ].join(" ");

  const userInput = JSON.stringify({
    niche: signal.niche,
    captionText: signal.captionText,
    beatTimestampsMs: signal.beatTimestampsMs,
    engagement: signal.engagement,
  });

  const result = await deps.textProvider.generateStructured<z.infer<typeof BlueprintStructureSchema>>({
    system,
    input: userInput,
    schema: BlueprintStructureSchema,
    maxTokens: 1000,
    temperature: 0.3,
  });

  await recordUsage(deps.tx, {
    workspaceId: deps.workspaceId,
    provider: deps.textProvider.id,
    model: deps.textProvider.model,
    units: 1,
    costUsd: result.costUsd,
    jobKind: "text",
  });

  return { ...result.data, sourceRef: signal.sourceRef };
}
