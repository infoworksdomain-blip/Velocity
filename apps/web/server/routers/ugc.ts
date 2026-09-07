import { z } from "zod";
import { getAdminDb } from "../db";
import {
  checkPersonaPolicyForGeneration,
  computeIdentityConsistencyReportForPersona,
  createConsentArtefact,
  createPersona,
  listConsentArtefacts,
  listPersonas,
  requestModerationReview,
  resolveModerationReview,
  selectUsableClipForWorkspace,
  triggerUgcBatchGeneration,
} from "../ugc-service";
import { requirePlatformPermission, requireWorkspacePermission, router } from "../trpc";

const READ = "content:read:workspace";
const CREATE = "content:create:workspace";

export const ugcRouter = router({
  personas: router({
    list: requireWorkspacePermission(READ).query(async ({ ctx }) => listPersonas(getAdminDb(), ctx.workspaceId)),

    create: requireWorkspacePermission(CREATE)
      .input(
        z.object({
          name: z.string().min(1),
          attributes: z.record(z.string(), z.unknown()).optional(),
          referenceImageStorageKey: z.string().min(1).optional(),
          modelsRealPerson: z.boolean(),
          consentArtefactId: z.string().uuid().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => createPersona(getAdminDb(), { workspaceId: ctx.workspaceId, ...input })),
  }),

  consentArtefacts: router({
    list: requireWorkspacePermission(READ).query(async ({ ctx }) => listConsentArtefacts(getAdminDb(), ctx.workspaceId)),

    create: requireWorkspacePermission(CREATE)
      .input(
        z.object({
          subjectName: z.string().min(1),
          documentStorageKey: z.string().min(1),
          signedAt: z.string().datetime(),
          expiresAt: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        createConsentArtefact(getAdminDb(), {
          workspaceId: ctx.workspaceId,
          subjectName: input.subjectName,
          documentStorageKey: input.documentStorageKey,
          signedAt: new Date(input.signedAt),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          verifiedByUserId: ctx.user.id,
        }),
      ),
  }),

  policy: router({
    /** Dry-run check — the UGC studio UI calls this before submitting so a blocked script never reaches generation. */
    check: requireWorkspacePermission(READ)
      .input(z.object({ personaId: z.string().uuid(), script: z.string().min(1) }))
      .query(async ({ ctx, input }) => checkPersonaPolicyForGeneration(getAdminDb(), { workspaceId: ctx.workspaceId, ...input })),
  }),

  /**
   * moderation_reviews' first real reader/writer (STEP 1's governance
   * schema had this table since the beginning, unused). `request` is a
   * workspace action (a member asking for a regulated-claim script to be
   * reviewed); `resolve` is a platform-moderator action (STEP 1's
   * `moderator` platform role, `moderation:review:platform`) — a real
   * cross-tenant permission boundary, not a workspace one, since
   * moderators review across every workspace by design.
   */
  moderationReviews: router({
    request: requireWorkspacePermission(CREATE)
      .input(z.object({ personaId: z.string().uuid(), script: z.string().min(1), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) =>
        requestModerationReview(getAdminDb(), {
          workspaceId: ctx.workspaceId,
          targetType: "persona_script",
          targetId: `${input.personaId}:${input.script}`,
          notes: input.notes,
        }),
      ),

    resolve: requirePlatformPermission("moderation:review:platform")
      .input(z.object({ workspaceId: z.string().uuid(), reviewId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) =>
        resolveModerationReview(getAdminDb(), {
          workspaceId: input.workspaceId,
          reviewId: input.reviewId,
          reviewerUserId: ctx.user.id,
          decision: input.decision,
          notes: input.notes,
        }),
      ),
  }),

  clips: router({
    selectUsable: requireWorkspacePermission(READ)
      .input(z.object({ territory: z.string().min(1), media: z.string().min(1) }))
      .query(async ({ ctx, input }) => selectUsableClipForWorkspace(getAdminDb(), { workspaceId: ctx.workspaceId, ...input })),
  }),

  identityConsistency: router({
    report: requireWorkspacePermission(READ)
      .input(z.object({ personaId: z.string().uuid(), referencePhash: z.string().min(1) }))
      .query(async ({ ctx, input }) => computeIdentityConsistencyReportForPersona(getAdminDb(), ctx.workspaceId, input.personaId, input.referencePhash)),
  }),

  batch: router({
    /** Every script is policy-checked before any render is triggered — see triggerUgcBatchGeneration's own doc comment. This is the endpoint's C7 approval event: the caller submitting a batch IS the human approval to generate. */
    generate: requireWorkspacePermission(CREATE)
      .input(z.object({ brandProfileId: z.string().uuid(), personaId: z.string().uuid(), scripts: z.array(z.string().min(1)).min(1).max(20), workspaceTier: z.string().min(1) }))
      .mutation(async ({ ctx, input }) =>
        triggerUgcBatchGeneration({ workspaceId: ctx.workspaceId, userId: ctx.user.id, brandProfileId: input.brandProfileId, personaId: input.personaId, scripts: input.scripts, workspaceTier: input.workspaceTier }),
      ),
  }),
});
