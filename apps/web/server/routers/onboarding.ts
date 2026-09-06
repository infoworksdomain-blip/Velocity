import { randomUUID } from "node:crypto";
import { nextOnboardingStage, type OnboardingStage } from "@velocity/core";
import { schema } from "@velocity/db";
import { StubConceptGenerationProvider, StubWebsiteIntelligenceProvider } from "@velocity/providers";
import { z } from "zod";
import { getAdminDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { createWorkspaceForUser } from "../workspace-service";

/**
 * STEP 5's onboarding flow. `analyzeWebsite` and the concept batch in
 * `complete` call stub providers (packages/providers) — STEP 6 and STEP 8
 * replace them with real implementations behind the same interfaces. See
 * docs/steps/STEP-05.md for why this step can't fully exist without them
 * yet, and why GATE 5's 90-second target isn't measurable against a stub.
 */

const websiteIntelligence = new StubWebsiteIntelligenceProvider();
const conceptGeneration = new StubConceptGenerationProvider();

async function recordEvent(sessionId: string, stage: OnboardingStage, workspaceId?: string) {
  await getAdminDb()
    .insert(schema.onboardingEvents)
    .values({ id: randomUUID(), sessionId, stage, workspaceId: workspaceId ?? null });
}

export const onboardingRouter = router({
  /** No auth required — onboarding starts before signup in the individual-user flow. Returns a session id the client carries through the rest of the flow. */
  start: publicProcedure
    .input(z.object({ workspaceType: z.enum(["individual", "business"]) }))
    .mutation(async () => {
      const sessionId = randomUUID();
      const stage = nextOnboardingStage("choose_type", { type: "TYPE_CHOSEN" });
      await recordEvent(sessionId, stage);
      return { sessionId, stage };
    }),

  analyzeWebsite: publicProcedure
    .input(z.object({ sessionId: z.string().uuid(), url: z.string().url() }))
    .mutation(async ({ input }) => {
      await recordEvent(input.sessionId, nextOnboardingStage("enter_url", { type: "URL_SUBMITTED" }));
      const brandProfile = await websiteIntelligence.analyze(input.url);
      const stage = nextOnboardingStage("analyzing", { type: "ANALYSIS_COMPLETE" });
      await recordEvent(input.sessionId, stage);
      return { stage, brandProfile };
    }),

  confirmProfile: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const stage = nextOnboardingStage("confirm_profile", { type: "PROFILE_CONFIRMED" });
      await recordEvent(input.sessionId, stage);
      return { stage };
    }),

  pickGoals: publicProcedure
    .input(z.object({ sessionId: z.string().uuid(), goals: z.array(z.string()).min(1).max(3) }))
    .mutation(async ({ input }) => {
      const stage = nextOnboardingStage("pick_goals", { type: "GOALS_PICKED" });
      await recordEvent(input.sessionId, stage);
      return { stage };
    }),

  /** Skippable, per the script. */
  connectSocial: publicProcedure
    .input(z.object({ sessionId: z.string().uuid(), skipped: z.boolean() }))
    .mutation(async ({ input }) => {
      const stage = nextOnboardingStage("connect_social", {
        type: input.skipped ? "SOCIAL_SKIPPED" : "SOCIAL_CONNECTED",
      });
      await recordEvent(input.sessionId, stage);
      return { stage };
    }),

  /** Creates the workspace and generates the initial (stubbed) concept batch. Requires auth — a user must exist by this point (signed up earlier in the flow, or via STEP 3's Google OAuth). */
  complete: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().uuid(),
        name: z.string().min(1),
        workspaceType: z.enum(["individual", "business"]),
        timezone: z.string().default("UTC"),
        brandProfile: z.object({
          product: z.string(),
          category: z.string(),
          oneLiner: z.string(),
          icpSegments: z.array(z.string()),
          pains: z.array(z.string()),
          benefits: z.array(z.string()),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { workspaceId } = await createWorkspaceForUser(ctx.user.id, {
        name: input.name,
        workspaceType: input.workspaceType,
        timezone: input.timezone,
      });

      const concepts = await conceptGeneration.generateInitialBatch(input.brandProfile);

      await recordEvent(input.sessionId, "done", workspaceId);

      return { workspaceId, concepts };
    }),
});
