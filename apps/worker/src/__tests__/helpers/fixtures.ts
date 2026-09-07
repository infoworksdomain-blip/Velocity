import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import type { RenderWorkflowInput } from "@velocity/contracts";

/**
 * Builds the minimal real FK chain a render workflow needs (organisation
 * -> workspace -> brand profile -> angle -> content concept -> text plan
 * -> content item), using the PGlite admin connection. Every row is real
 * — no mocked repository, a genuine insert into a genuine (embedded)
 * Postgres, exercising the actual FK constraints the schema declares.
 */
export async function buildRenderFixture(
  testDb: PgliteTestDb,
  overrides: { format?: RenderWorkflowInput["format"] } = {},
): Promise<RenderWorkflowInput> {
  const organisationId = randomUUID();
  const workspaceId = randomUUID();
  const brandProfileId = randomUUID();
  const angleId = randomUUID();
  const textPlanId = randomUUID();
  const contentConceptId = randomUUID();
  const contentItemId = randomUUID();
  const renderId = randomUUID();

  await testDb.admin.insert(schema.organisations).values({ id: organisationId, name: "Fixture Org" });
  await testDb.admin.insert(schema.workspaces).values({ id: workspaceId, organisationId, name: "Fixture Workspace", workspaceType: "business" });
  await testDb.admin.insert(schema.brandProfiles).values({
    id: brandProfileId,
    workspaceId,
    version: 1,
    product: "TaskFlow",
    category: "productivity software",
    sourceUrl: "https://taskflow.example.com",
  });
  await testDb.admin.insert(schema.angles).values({ id: angleId, workspaceId, brandProfileId, kind: "pain_led", description: "Solving disorganisation" });
  await testDb.admin.insert(schema.textPlans).values({ id: textPlanId, workspaceId, version: "1.0", plan: { placeholder: true } });
  await testDb.admin.insert(schema.contentConcepts).values({
    id: contentConceptId,
    workspaceId,
    angleId,
    format: overrides.format ?? "meme",
    hook: "Why nobody talks about staying organised",
    textPlanId,
    predictedScore: "0.5",
  });
  await testDb.admin.insert(schema.contentItems).values({
    id: contentItemId,
    workspaceId,
    contentConceptId,
    textPlanId,
    status: "queued",
  });

  return {
    renderId,
    workspaceId,
    contentItemId,
    contentConceptId,
    format: overrides.format ?? "meme",
    storyboard: { scenes: [{ durationMs: 3000, visualDirective: "A caption bar over a stock background", onScreenText: "Why nobody talks about staying organised" }] },
    textPlanId,
    personaId: null,
    workspaceTier: "growth",
    costCeilingUsd: 5,
    regenerationRound: 0,
  };
}
