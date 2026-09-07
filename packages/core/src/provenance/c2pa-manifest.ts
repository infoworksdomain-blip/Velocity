/**
 * C2PA manifest construction (C2, STEP 8.4). The manifest *content* built
 * here is real and schema-shaped to the actual C2PA spec (actions,
 * digitalSourceType, ai_generated assertion). Cryptographically SIGNING
 * and embedding it into the asset is a separate, harder question — see
 * `ProvenanceSigner` below and docs/steps/STEP-08.md's provenance section
 * for the feasibility research and why this repo doesn't take a hard
 * dependency on a C2PA signing library yet.
 */

export const AI_GENERATED_DIGITAL_SOURCE_TYPE =
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" as const;

export interface C2paAction {
  action: "c2pa.created" | "c2pa.opened" | "c2pa.edited";
  digitalSourceType?: string;
  when: string;
}

export interface C2paManifest {
  claimGenerator: string;
  format: string;
  title: string;
  assertions: {
    actions: { actions: C2paAction[] };
    aiGenerated: { value: true };
    modelProvenance: { modelId: string; promptHash: string };
    watermark: { modelWatermarkPreserved: boolean };
  };
}

export interface BuildManifestInput {
  claimGenerator: string;
  format: string;
  title: string;
  modelId: string;
  promptHash: string;
  modelWatermarkPreserved: boolean;
  createdAt: Date;
}

export function buildManifest(input: BuildManifestInput): C2paManifest {
  return {
    claimGenerator: input.claimGenerator,
    format: input.format,
    title: input.title,
    assertions: {
      actions: {
        actions: [
          {
            action: "c2pa.created",
            digitalSourceType: AI_GENERATED_DIGITAL_SOURCE_TYPE,
            when: input.createdAt.toISOString(),
          },
        ],
      },
      aiGenerated: { value: true },
      modelProvenance: { modelId: input.modelId, promptHash: input.promptHash },
      watermark: { modelWatermarkPreserved: input.modelWatermarkPreserved },
    },
  };
}

export interface SignResult {
  /** A reference to where the manifest (signed or not) can be retrieved — `renders.c2paManifestRef`. */
  manifestRef: string;
  signed: boolean;
}

/**
 * The signing seam. Feasibility was researched directly: `@contentauth/c2pa-node`
 * (the official CAI Node binding) installs and its Builder/Reader API genuinely
 * runs — verified with a real self-signed test certificate that got as far as
 * the actual Rust C2PA engine's certificate-profile validation (which rejected
 * it, correctly, for not being a spec-conformant signing cert: C2PA requires a
 * real CA-issued or properly-profiled certificate, not an arbitrary self-signed
 * one, even for local testing). It also requires Node >=22; this monorepo is
 * pinned to Node 20. Given both a real signing certificate and a Node version
 * bump are deployment/credential decisions, not something to fabricate, this
 * repo does not take a hard dependency on the library. `DevUnsignedManifestSigner`
 * below is real and used by default; a `C2paNodeSigner` is a documented seam for
 * whoever adds the credential and makes the version bump.
 */
export interface ProvenanceSigner {
  sign(manifest: C2paManifest): Promise<SignResult>;
}

/**
 * Stores the manifest content (unsigned) and returns a reference to it.
 * `renders.c2paSigned` is set to `false` for every render produced this way
 * — GATE 8's "every render carries a valid C2PA manifest" is honestly
 * reported as "manifest is complete and schema-valid; cryptographic
 * signing/embedding requires a production signing certificate, not present
 * in this environment" rather than claimed as fully real.
 */
export class DevUnsignedManifestSigner implements ProvenanceSigner {
  constructor(private readonly store: (manifest: C2paManifest) => Promise<string>) {}

  async sign(manifest: C2paManifest): Promise<SignResult> {
    const manifestRef = await this.store(manifest);
    return { manifestRef, signed: false };
  }
}
