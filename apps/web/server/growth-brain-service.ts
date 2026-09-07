import { randomUUID } from "node:crypto";
import { trends } from "@velocity/core";
import type { content as coreContent } from "@velocity/core";
import { schema } from "@velocity/db";
import { AnthropicTextProvider, StubTextProvider } from "@velocity/text-engine";
import type { TrendSignal } from "@velocity/contracts";
import { getAdminDb } from "./db";

const { extractBlueprint } = trends;

type StructuredTextProvider = coreContent.StructuredTextProvider;

/**
 * Real blueprint extraction reused as-is from STEP 8.3 (packages/core/src/
 * trends/blueprint-extractor.ts) — the same function organic trend
 * discovery calls, now also called from STEP 14's Competitor Intelligence
 * (see routers/growth-brain.ts's `competitors.ingestObservedPost`).
 * `extractBlueprint` itself has no idea whether its input came from an
 * organic trend signal or a tracked competitor's observed post — the
 * distinction lives entirely in `trend_blueprints.competitor_id`, set
 * here after extraction, not threaded through the extractor.
 */
function getTextProvider(): StructuredTextProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new AnthropicTextProvider("claude-sonnet-4-6", apiKey, ["growth"]) : new StubTextProvider("anthropic", ["growth"]);
}

export async function extractBlueprintForCompetitor(workspaceId: string, competitorId: string, signal: TrendSignal): Promise<{ blueprintId: string }> {
  const db = getAdminDb();
  const textProvider = getTextProvider();

  const structure = await extractBlueprint({ textProvider, tx: db, workspaceId }, signal);

  const blueprintId = randomUUID();
  await db.insert(schema.trendBlueprints).values({
    id: blueprintId,
    workspaceId,
    competitorId,
    hookPattern: structure.hookPattern,
    beatTimings: structure.beatTimings,
    shotGrammar: structure.shotGrammar,
    captionCadence: structure.captionCadence,
    textPlacement: structure.textPlacement,
    audioArchetype: structure.audioArchetype,
    nicheTags: structure.nicheTags,
    velocityScore: structure.velocityScore.toString(),
    sourceRef: structure.sourceRef,
  });

  return { blueprintId };
}
