import type { RenderProgress } from "@remotion/lambda/client";
import { describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "../../storage/local.blob-store.js";
import { RemotionLambdaCompositor } from "../remotion-lambda.compositor.js";

/**
 * Post-STEP-22 audit remediation. Same DI-seam testing discipline as
 * every other vendor adapter in this codebase (Stripe, Anthropic, OpenAI)
 * — real class, fake injected functions standing in for the real
 * @remotion/lambda SDK calls and S3 download, since there's no funded AWS
 * account/deployed Lambda function in this sandbox to call for real.
 */
function fakeProgress(overrides: Partial<RenderProgress> = {}): RenderProgress {
  return {
    chunks: 1,
    done: false,
    encodingStatus: null,
    costs: {} as RenderProgress["costs"],
    renderId: "render-1",
    renderMetadata: null,
    bucket: "remotionlambda-test",
    outputFile: null,
    outKey: null,
    outBucket: null,
    timeToFinish: null,
    errors: [],
    fatalErrorEncountered: false,
    currentTime: 0,
    renderSize: 0,
    lambdasInvoked: 1,
    cleanup: null,
    timeToFinishChunks: null,
    timeToRenderFrames: null,
    timeToEncode: null,
    overallProgress: 0,
    retriesInfo: [],
    mostExpensiveFrameRanges: null,
    framesRendered: 0,
    outputSizeInBytes: null,
    type: "success",
    estimatedBillingDurationInMilliseconds: null,
    combinedFrames: 0,
    timeToCombine: null,
    timeoutTimestamp: Date.now() + 60000,
    functionLaunched: Date.now(),
    serveUrlOpened: null,
    compositionValidated: null,
    artifacts: [],
    ...overrides,
  };
}

const CONFIG = { region: "us-east-1" as const, functionName: "remotion-render-velocity", serveUrl: "https://example.cloudfront.net/site", compositionId: "VerticalVideo" };
const SPEC = { shotOutputRefs: ["shot-1", "shot-2"], voiceoverOutputRef: "vo-1", textOverlayRef: "text-1", targetResolution: "1080x1920", targetDurationSec: 10 };

describe("RemotionLambdaCompositor", () => {
  it("resolves every shot/VO/text ref to a signed URL and splits duration evenly across shots", async () => {
    const blobStore = new InMemoryBlobStore();
    const render = vi.fn().mockResolvedValue({ renderId: "render-1", bucketName: "remotionlambda-test" });
    const progress = vi.fn().mockResolvedValue(fakeProgress({ done: true, outKey: "renders/render-1.mp4", outBucket: "remotionlambda-test" }));
    const downloadFromS3 = vi.fn().mockResolvedValue(Buffer.from("fake-mp4-bytes"));

    const compositor = new RemotionLambdaCompositor(blobStore, CONFIG, { render, progress, downloadFromS3 });
    await compositor.compose(SPEC);

    expect(render).toHaveBeenCalledTimes(1);
    const call = render.mock.calls[0]![0];
    expect(call.region).toBe("us-east-1");
    expect(call.functionName).toBe("remotion-render-velocity");
    expect(call.serveUrl).toBe(CONFIG.serveUrl);
    expect(call.composition).toBe("VerticalVideo");
    expect(call.inputProps.shotUrls).toEqual(["memory://shot-1", "memory://shot-2"]);
    expect(call.inputProps.shotDurationsSec).toEqual([5, 5]); // 10s / 2 shots
    expect(call.inputProps.voiceoverUrl).toBe("memory://vo-1");
    expect(call.inputProps.textOverlayRef).toBe("memory://text-1");
    expect(call.forceWidth).toBe(1080);
    expect(call.forceHeight).toBe(1920);
  });

  it("polls until done and downloads the finished render into the SAME blob store every other Compositor output uses", async () => {
    const blobStore = new InMemoryBlobStore();
    const render = vi.fn().mockResolvedValue({ renderId: "render-2", bucketName: "remotionlambda-test" });
    const progress = vi
      .fn()
      .mockResolvedValueOnce(fakeProgress({ done: false }))
      .mockResolvedValueOnce(fakeProgress({ done: false }))
      .mockResolvedValueOnce(fakeProgress({ done: true, outKey: "renders/render-2.mp4", outBucket: "remotionlambda-test" }));
    const downloadFromS3 = vi.fn().mockResolvedValue(Buffer.from("real-enough-bytes"));

    const compositor = new RemotionLambdaCompositor(blobStore, CONFIG, { render, progress, downloadFromS3, pollIntervalMs: 1 });
    const result = await compositor.compose(SPEC);

    expect(progress).toHaveBeenCalledTimes(3);
    expect(downloadFromS3).toHaveBeenCalledWith("remotionlambda-test", "renders/render-2.mp4", "us-east-1");
    expect(result.outputStorageKey).toBe("remotion-lambda/render-2.mp4");
    expect(await blobStore.get(result.outputStorageKey)).toEqual(Buffer.from("real-enough-bytes"));
    expect(result.widthPx).toBe(1080);
    expect(result.heightPx).toBe(1920);
    expect(result.durationMs).toBe(10000);
    expect(result.hasAudio).toBe(true);
  });

  it("throws with the real error messages when Remotion reports a fatal error", async () => {
    const blobStore = new InMemoryBlobStore();
    const render = vi.fn().mockResolvedValue({ renderId: "render-3", bucketName: "remotionlambda-test" });
    const progress = vi.fn().mockResolvedValue(
      fakeProgress({
        done: false,
        fatalErrorEncountered: true,
        errors: [{ type: "renderer", message: "Composition threw an error", name: "Error", stack: "", frame: 12, chunk: 0, isFatal: true, attempt: 1, willRetry: false, totalAttempts: 1, s3Location: "", explanation: null } as RenderProgress["errors"][number]],
      }),
    );
    const downloadFromS3 = vi.fn();

    const compositor = new RemotionLambdaCompositor(blobStore, CONFIG, { render, progress, downloadFromS3 });
    await expect(compositor.compose(SPEC)).rejects.toThrow(/Composition threw an error/);
    expect(downloadFromS3).not.toHaveBeenCalled();
  });

  it("throws if the render never finishes within the poll budget rather than hanging forever", async () => {
    // Real interval/attempt count would mean a real ~10-minute wait — this
    // codebase's own "no wall-clock waiting" discipline (STEP 11's
    // token-refresh-daemon test) calls for injecting a tiny budget instead
    // of faking timers or padding the test timeout.
    const blobStore = new InMemoryBlobStore();
    const render = vi.fn().mockResolvedValue({ renderId: "render-4", bucketName: "remotionlambda-test" });
    const progress = vi.fn().mockResolvedValue(fakeProgress({ done: false }));

    const compositor = new RemotionLambdaCompositor(blobStore, CONFIG, { render, progress, downloadFromS3: vi.fn(), pollIntervalMs: 1, maxPollAttempts: 3 });
    await expect(compositor.compose({ ...SPEC, targetDurationSec: 1 })).rejects.toThrow(/did not finish/);
    expect(progress).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("handles a spec with no voiceover or text overlay (both null)", async () => {
    const blobStore = new InMemoryBlobStore();
    const render = vi.fn().mockResolvedValue({ renderId: "render-5", bucketName: "remotionlambda-test" });
    const progress = vi.fn().mockResolvedValue(fakeProgress({ done: true, outKey: "renders/render-5.mp4", outBucket: "remotionlambda-test" }));
    const downloadFromS3 = vi.fn().mockResolvedValue(Buffer.from("x"));

    const compositor = new RemotionLambdaCompositor(blobStore, CONFIG, { render, progress, downloadFromS3 });
    const result = await compositor.compose({ ...SPEC, voiceoverOutputRef: null, textOverlayRef: null });

    const call = render.mock.calls[0]![0];
    expect(call.inputProps.voiceoverUrl).toBeNull();
    expect(call.inputProps.textOverlayRef).toBeNull();
    expect(result.hasAudio).toBe(false);
  });
});
