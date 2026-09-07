import { describe, expect, it } from "vitest";
import { AI_GENERATED_DIGITAL_SOURCE_TYPE, buildManifest, DevUnsignedManifestSigner } from "../c2pa-manifest.js";

describe("buildManifest", () => {
  it("sets the AI-generated digital source type on the creation action", () => {
    const manifest = buildManifest({
      claimGenerator: "velocity/1.0",
      format: "video/mp4",
      title: "render.mp4",
      modelId: "kling-3.0",
      promptHash: "abc123",
      modelWatermarkPreserved: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(manifest.assertions.actions.actions[0]).toMatchObject({
      action: "c2pa.created",
      digitalSourceType: AI_GENERATED_DIGITAL_SOURCE_TYPE,
    });
  });

  it("always sets aiGenerated to true — this manifest is only ever built for generated content", () => {
    const manifest = buildManifest({
      claimGenerator: "velocity/1.0",
      format: "video/mp4",
      title: "render.mp4",
      modelId: "kling-3.0",
      promptHash: "abc123",
      modelWatermarkPreserved: false,
      createdAt: new Date(),
    });
    expect(manifest.assertions.aiGenerated.value).toBe(true);
  });

  it("carries the model id and prompt hash for audit (C2)", () => {
    const manifest = buildManifest({
      claimGenerator: "velocity/1.0",
      format: "video/mp4",
      title: "render.mp4",
      modelId: "veo-3.1",
      promptHash: "deadbeef",
      modelWatermarkPreserved: true,
      createdAt: new Date(),
    });
    expect(manifest.assertions.modelProvenance).toEqual({ modelId: "veo-3.1", promptHash: "deadbeef" });
  });
});

describe("DevUnsignedManifestSigner", () => {
  it("stores the manifest and reports signed: false (honesty about the signing seam)", async () => {
    const stored: unknown[] = [];
    const signer = new DevUnsignedManifestSigner(async (manifest) => {
      stored.push(manifest);
      return "manifest-ref-123";
    });

    const manifest = buildManifest({
      claimGenerator: "velocity/1.0",
      format: "video/mp4",
      title: "render.mp4",
      modelId: "kling-3.0",
      promptHash: "abc",
      modelWatermarkPreserved: false,
      createdAt: new Date(),
    });

    const result = await signer.sign(manifest);
    expect(result).toEqual({ manifestRef: "manifest-ref-123", signed: false });
    expect(stored).toEqual([manifest]);
  });
});
