import { createHash } from "node:crypto";
import { qc as qcCore } from "@velocity/core";
import type { QcReport } from "@velocity/contracts";
import { schema } from "@velocity/db";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { runInWorkspaceTx } from "./context.js";

export interface QcInput {
  workspaceId: string;
  renderId: string;
  hookText: string;
  competitors: string[];
  brandProfileId: string | null;
  widthPx: number;
  heightPx: number;
  durationMs: number;
  hasAudio: boolean;
  requiresAudio: boolean;
  targetWidthPx: number;
  targetHeightPx: number;
  minDurationMs: number;
  maxDurationMs: number;
  compositionDescriptor: string;
}

/**
 * QC (STEP 8.4). Safety and brand-rule checks are real (packages/core/qc).
 * Duration/aspect/audio checks run against real numbers from the stub
 * compositor's spec-derived output. The pHash: with no real rendered
 * frame available (no ffmpeg/Lambda), it's derived deterministically from
 * the composition's own descriptor rather than actual pixel content — the
 * *hashing and comparison algorithm* is real and unit-tested
 * (packages/core/qc/phash.ts); what's stand-in is the upstream "sample a
 * frame" step, honestly flagged rather than silently faked as a real
 * visual hash.
 */
export async function runQcActivity(input: QcInput): Promise<QcReport> {
  const grayscale = new Uint8Array(64);
  const digest = createHash("sha256").update(input.compositionDescriptor).digest();
  for (let i = 0; i < 64; i++) grayscale[i] = digest[i % digest.length] ?? 0;
  const phash = qcCore.perceptualHash(grayscale);

  const brandProfileId = input.brandProfileId;
  const brandRules = brandProfileId
    ? await runInWorkspaceTx(input.workspaceId, async (db) => {
        const rows = await db
          .select({ bannedWords: schema.brandRules.bannedWords, bannedClaims: schema.brandRules.bannedClaims, requiredDisclaimers: schema.brandRules.requiredDisclaimers })
          .from(schema.brandRules)
          .where(eq(schema.brandRules.brandProfileId, brandProfileId))
          .limit(1);
        return rows[0] ?? null;
      })
    : null;

  const priorPhashes = await runInWorkspaceTx(input.workspaceId, async (db) => {
    const rows = await db
      .select({ phash: schema.renders.phash })
      .from(schema.renders)
      .where(and(eq(schema.renders.workspaceId, input.workspaceId), isNotNull(schema.renders.phash), ne(schema.renders.id, input.renderId)))
      .limit(200);
    return rows.map((r: { phash: string | null }) => r.phash!).filter(Boolean);
  });

  const isNearDuplicate = priorPhashes.some((prior: string) => qcCore.isNearDuplicate(phash, prior));

  const report = qcCore.runQc({
    safety: qcCore.classifySafety(input.hookText, input.competitors),
    brandRuleViolations: qcCore.checkBrandRules(input.hookText, brandRules),
    isNearDuplicate,
    durationAspect: qcCore.checkDurationAndAspect(
      { widthPx: input.widthPx, heightPx: input.heightPx, durationMs: input.durationMs, hasAudioTrack: input.hasAudio },
      { targetWidthPx: input.targetWidthPx, targetHeightPx: input.targetHeightPx, minDurationMs: input.minDurationMs, maxDurationMs: input.maxDurationMs, requiresAudio: input.requiresAudio },
    ),
    audioPresence: qcCore.checkAudioPresence(
      { widthPx: input.widthPx, heightPx: input.heightPx, durationMs: input.durationMs, hasAudioTrack: input.hasAudio },
      { targetWidthPx: input.targetWidthPx, targetHeightPx: input.targetHeightPx, minDurationMs: input.minDurationMs, maxDurationMs: input.maxDurationMs, requiresAudio: input.requiresAudio },
    ),
  });

  await runInWorkspaceTx(input.workspaceId, (db) =>
    db.update(schema.renders).set({ phash, qcPassed: report.verdict === "pass", qcNotes: report.notes }).where(eq(schema.renders.id, input.renderId)),
  );

  return report;
}
