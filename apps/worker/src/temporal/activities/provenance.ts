import { provenance as provenanceCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { eq } from "drizzle-orm";
import { getBlobStore, runInWorkspaceTx } from "./context.js";

export interface ProvenanceInput {
  workspaceId: string;
  renderId: string;
  modelId: string;
  promptHash: string;
  outputStorageKey: string;
}

export interface ProvenanceResult {
  c2paManifestRef: string;
  c2paSigned: boolean;
  modelWatermarkPreserved: boolean;
}

/**
 * C2 compliance (STEP 8.4). The manifest content is real and schema-valid
 * (packages/core/src/provenance/c2pa-manifest.ts); signing uses
 * `DevUnsignedManifestSigner` since a production C2PA signing certificate
 * is a credential decision this environment doesn't have (see
 * docs/steps/STEP-08.md's feasibility research on @contentauth/c2pa-node).
 * `c2paSigned: false` records this honestly in the `renders` row rather
 * than claiming a cryptographic guarantee that doesn't exist yet.
 */
export async function recordProvenance(input: ProvenanceInput): Promise<ProvenanceResult> {
  const blobStore = getBlobStore();
  const manifest = provenanceCore.buildManifest({
    claimGenerator: "velocity/0.1",
    format: "video/mp4",
    title: input.renderId,
    modelId: input.modelId,
    promptHash: input.promptHash,
    modelWatermarkPreserved: true,
    createdAt: new Date(),
  });

  const signer = new provenanceCore.DevUnsignedManifestSigner(async (m) => {
    const ref = `c2pa-manifest/${input.renderId}.json`;
    await blobStore.put(ref, JSON.stringify(m));
    return ref;
  });
  const { manifestRef, signed } = await signer.sign(manifest);

  await runInWorkspaceTx(input.workspaceId, (db) =>
    db
      .update(schema.renders)
      .set({ c2paManifestRef: manifestRef, c2paSigned: signed, modelWatermarkPreserved: true })
      .where(eq(schema.renders.id, input.renderId)),
  );

  return { c2paManifestRef: manifestRef, c2paSigned: signed, modelWatermarkPreserved: true };
}
