import { describe, expect, it } from "vitest";
import { createSeedreamStubProvider } from "../adapters/image/seedream.stub.js";
import { createElevenLabsStubProvider } from "../adapters/tts/elevenlabs.stub.js";
import { createWhisperXStubProvider, decodeWordsIfStubVo, encodeStubVoScript } from "../adapters/transcription/whisperx.stub.js";
import { createKlingStubProvider } from "../adapters/video/kling.stub.js";
import { createMinimaxStubProvider } from "../adapters/video/minimax.stub.js";
import { createSeedanceStubProvider } from "../adapters/video/seedance.stub.js";
import { createVeoStubProvider } from "../adapters/video/veo.stub.js";
import { createWanStubProvider } from "../adapters/video/wan.stub.js";
import type { ImageProvider, ProviderJobHandle, TranscriptionProvider, TTSProvider, VideoProvider } from "../types.js";

const TIERS = ["free", "starter", "growth", "pro"];

async function pollUntilTerminal<T extends { state: string }>(poll: () => Promise<T>, maxAttempts = 20): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await poll();
    if (status.state === "succeeded" || status.state === "failed") return status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Job never reached a terminal state");
}

describe("VideoProvider conformance — one shared suite run against every video stub adapter", () => {
  const providers: [string, VideoProvider][] = [
    ["kling-3.0", createKlingStubProvider(TIERS)],
    ["veo-3.1", createVeoStubProvider(TIERS)],
    ["seedance-2.5", createSeedanceStubProvider(TIERS)],
    ["minimax-h3", createMinimaxStubProvider(TIERS)],
    ["wan-2.2", createWanStubProvider(TIERS)],
  ];

  it.each(providers)("%s: has a well-formed capability manifest", (_id, provider) => {
    expect(provider.capabilities.commercialUse).toBe(true);
    expect(provider.capabilities.tiers.length).toBeGreaterThan(0);
    expect(provider.capabilities.maxDurationSec).toBeGreaterThan(0);
    expect(provider.capabilities.resolutions.length).toBeGreaterThan(0);
    expect(["none", "model", "forced"]).toContain(provider.capabilities.watermark);
  });

  it.each(providers)("%s: estimateCost matches the manifest's costPerSecond", (_id, provider) => {
    const cost = provider.estimateCost({ prompt: "x", durationSec: 5, resolution: "1080x1920" });
    expect(cost).toBeCloseTo(provider.capabilities.costPerSecond * 5, 6);
  });

  it.each(providers)("%s: generate -> poll reaches a terminal state and reports cost only on success", async (_id, provider) => {
    const handle = await provider.generate({ prompt: "hook demo", durationSec: 4, resolution: "1080x1920" });
    expect(handle.providerId).toBe(provider.id);

    const status = await pollUntilTerminal(() => provider.poll(handle));
    expect(["succeeded", "failed"]).toContain(status.state);
    if (status.state === "succeeded") {
      expect(status.costUsd).toBeGreaterThan(0);
    }
  });

  it.each(providers)("%s: calling generate twice with identical input returns the same job id (stub-level idempotency)", async (_id, provider) => {
    const input = { prompt: "identical", durationSec: 3, resolution: "1080x1920" };
    const handleA = await provider.generate(input);
    const handleB = await provider.generate(input);
    expect(handleA.externalJobId).toBe(handleB.externalJobId);
  });

  it.each(providers)("%s: generate with different input returns a different job id", async (_id, provider) => {
    const handleA = await provider.generate({ prompt: "a", durationSec: 3, resolution: "1080x1920" });
    const handleB = await provider.generate({ prompt: "b", durationSec: 3, resolution: "1080x1920" });
    expect(handleA.externalJobId).not.toBe(handleB.externalJobId);
  });
});

describe("ImageProvider (Seedream) conformance", () => {
  const provider: ImageProvider = createSeedreamStubProvider(TIERS);

  it("has a well-formed capability manifest", () => {
    expect(provider.capabilities.commercialUse).toBe(true);
    expect(provider.capabilities.costPerImage).toBeGreaterThan(0);
  });

  it("generate -> poll reaches succeeded", async () => {
    const handle: ProviderJobHandle = await provider.generate({ prompt: "product shot", count: 4 });
    const status = await pollUntilTerminal(() => provider.poll(handle));
    expect(status.state).toBe("succeeded");
  });

  it("estimateCost scales with image count", () => {
    expect(provider.estimateCost({ prompt: "x", count: 10 })).toBeCloseTo(provider.capabilities.costPerImage * 10, 6);
  });
});

describe("TTSProvider (ElevenLabs) conformance", () => {
  const provider: TTSProvider = createElevenLabsStubProvider(TIERS);

  it("has a well-formed capability manifest", () => {
    expect(provider.capabilities.commercialUse).toBe(true);
    expect(provider.capabilities.costPerCharacter).toBeGreaterThan(0);
  });

  it("generate -> poll reaches succeeded", async () => {
    const handle = await provider.generate({ script: "Hello world, this is a test script.", voiceId: "v1" });
    const status = await pollUntilTerminal(() => provider.poll(handle));
    expect(status.state).toBe("succeeded");
  });
});

describe("TranscriptionProvider (WhisperX) conformance + stub-vo word timing", () => {
  const provider: TranscriptionProvider = createWhisperXStubProvider(TIERS);

  it("has a well-formed capability manifest", () => {
    expect(provider.capabilities.commercialUse).toBe(true);
  });

  it("transcribe -> poll reaches succeeded", async () => {
    const audioUrl = encodeStubVoScript("This is a short voiceover script.");
    const handle = await provider.transcribe({ audioUrl });
    const status = await pollUntilTerminal(() => provider.poll(handle));
    expect(status.state).toBe("succeeded");
  });

  it("decodeWordsIfStubVo produces real, monotonically-increasing word timings covering every word", () => {
    const script = "This is a short voiceover script";
    const words = decodeWordsIfStubVo(encodeStubVoScript(script));
    expect(words).not.toBeNull();
    expect(words!.map((w) => w.word)).toEqual(script.split(" "));
    for (let i = 1; i < words!.length; i++) {
      expect(words![i]!.startMs).toBeGreaterThanOrEqual(words![i - 1]!.endMs);
    }
    for (const w of words!) {
      expect(w.endMs).toBeGreaterThan(w.startMs);
    }
  });

  it("decodeWordsIfStubVo returns null for a real (non-stub) audio URL", () => {
    expect(decodeWordsIfStubVo("https://real-vendor.example.com/audio.mp3")).toBeNull();
  });
});
