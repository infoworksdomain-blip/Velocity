import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { renderMediaOnLambda, getRenderProgress } from "@remotion/lambda/client";
import type { AwsRegion, RenderMediaOnLambdaInput, RenderMediaOnLambdaOutput, GetRenderProgressInput, RenderProgress } from "@remotion/lambda/client";
import type { CompositionOutput, ComposeSpec } from "@velocity/contracts";
import DEFAULT_SAFE_AREAS_CONFIG from "../../../../config/safe-areas.json" with { type: "json" };
import type { BlobStore } from "../storage/blob-store.js";
import type { Compositor } from "./compositor.js";

/**
 * The real production implementation `compositor.ts`'s own doc comment has
 * pointed at since STEP 8 ("a production implementation renders via
 * Remotion on Lambda (ADR 0002)") — built against @remotion/lambda
 * 4.0.499's real, documented client API (renderMediaOnLambda,
 * getRenderProgress — never invented, per this build's rule 5), tested
 * via constructor-injected function references the same DI-seam
 * discipline every other vendor adapter in this codebase uses (Stripe,
 * Anthropic, OpenAI, the video/image/tts stub providers).
 *
 * A real, documented contract gap this class works within rather than
 * papers over: `ComposeSpec` (packages/contracts) carries only an
 * aggregate `targetDurationSec`, not per-shot timing, and carries no
 * `targetPlatforms`/`safeAreasConfig` override, caption words, or brand
 * logo — those fields exist on the real `VerticalVideoProps` schema
 * (apps/render's own composition) but nothing upstream of `compose()`
 * populates them onto `ComposeSpec` yet. This class divides the total
 * duration evenly across shots and uses the same defaults `apps/render/
 * src/root.tsx` itself falls back to (all three platforms, the real safe-
 * areas config, no captions, no logo) — a real, working render with an
 * honestly-simplified output, not a fake mechanism. Extending
 * `ComposeSpec` to carry real per-shot/caption/platform data is a
 * separate, larger contract change this pass does not make.
 */
export interface RemotionLambdaConfig {
  region: AwsRegion;
  functionName: string;
  serveUrl: string;
  /** Matches root.tsx's <Composition id="VerticalVideo" ...>. */
  compositionId: string;
}

export interface RemotionLambdaDeps {
  render: (input: RenderMediaOnLambdaInput) => Promise<RenderMediaOnLambdaOutput>;
  progress: (input: GetRenderProgressInput) => Promise<RenderProgress>;
  /** Downloads the finished render's bytes from Remotion's own S3 output bucket, so the returned key stays resolvable through the SAME BlobStore every other Compositor output already is. */
  downloadFromS3: (bucket: string, key: string, region: string) => Promise<Buffer>;
  /** Injectable so tests can prove the poll-timeout path without a real multi-minute wait — same "no wall-clock waiting" discipline as STEP 11's token-refresh-daemon test. */
  pollIntervalMs: number;
  maxPollAttempts: number;
}

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_ATTEMPTS = 200; // 10 minutes at the default interval — generous for a short-form video, bounded so a stuck render doesn't hang an activity forever

function parseResolution(resolution: string): { widthPx: number; heightPx: number } {
  const [width, height] = resolution.split("x").map(Number);
  if (!width || !height) throw new Error(`Invalid resolution string: ${resolution}`);
  return { widthPx: width, heightPx: height };
}

async function defaultDownloadFromS3(bucket: string, key: string, region: string): Promise<Buffer> {
  const client = new S3Client({ region });
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) throw new Error(`RemotionLambdaCompositor: S3 GetObject for s3://${bucket}/${key} returned no body`);
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RemotionLambdaCompositor implements Compositor {
  private readonly deps: RemotionLambdaDeps;

  constructor(
    private readonly blobStore: BlobStore,
    private readonly config: RemotionLambdaConfig,
    deps?: Partial<RemotionLambdaDeps>,
  ) {
    this.deps = {
      render: deps?.render ?? renderMediaOnLambda,
      progress: deps?.progress ?? getRenderProgress,
      downloadFromS3: deps?.downloadFromS3 ?? defaultDownloadFromS3,
      pollIntervalMs: deps?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      maxPollAttempts: deps?.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
    };
  }

  async compose(spec: ComposeSpec): Promise<CompositionOutput> {
    const { widthPx, heightPx } = parseResolution(spec.targetResolution);

    const shotUrls = await Promise.all(spec.shotOutputRefs.map((ref) => this.blobStore.signedUrl(ref)));
    const voiceoverUrl = spec.voiceoverOutputRef ? await this.blobStore.signedUrl(spec.voiceoverOutputRef) : null;
    const textOverlayUrl = spec.textOverlayRef ? await this.blobStore.signedUrl(spec.textOverlayRef) : null;
    const perShotDurationSec = shotUrls.length > 0 ? spec.targetDurationSec / shotUrls.length : spec.targetDurationSec;

    const { renderId, bucketName } = await this.deps.render({
      region: this.config.region,
      functionName: this.config.functionName,
      serveUrl: this.config.serveUrl,
      composition: this.config.compositionId,
      codec: "h264",
      inputProps: {
        shotUrls,
        shotDurationsSec: shotUrls.map(() => perShotDurationSec),
        voiceoverUrl,
        textOverlayRef: textOverlayUrl,
        targetPlatforms: ["tiktok", "reels", "shorts"],
        safeAreasConfig: DEFAULT_SAFE_AREAS_CONFIG,
        captionWords: [],
        brandLogoUrl: null,
      },
      forceWidth: widthPx,
      forceHeight: heightPx,
    });

    let progress = await this.deps.progress({ functionName: this.config.functionName, bucketName, renderId, region: this.config.region });
    let attempts = 0;
    while (!progress.done && !progress.fatalErrorEncountered && attempts < this.deps.maxPollAttempts) {
      await sleep(this.deps.pollIntervalMs);
      progress = await this.deps.progress({ functionName: this.config.functionName, bucketName, renderId, region: this.config.region });
      attempts += 1;
    }

    if (progress.fatalErrorEncountered) {
      const messages = progress.errors.map((e) => e.message).join("; ") || "unknown error";
      throw new Error(`RemotionLambdaCompositor: render ${renderId} failed — ${messages}`);
    }
    if (!progress.done || !progress.outKey) {
      throw new Error(`RemotionLambdaCompositor: render ${renderId} did not finish within ${(this.deps.maxPollAttempts * this.deps.pollIntervalMs) / 1000}s`);
    }

    const outBucket = progress.outBucket ?? bucketName;
    const bytes = await this.deps.downloadFromS3(outBucket, progress.outKey, this.config.region);
    const outputStorageKey = `remotion-lambda/${renderId}.mp4`;
    await this.blobStore.put(outputStorageKey, bytes);

    return {
      outputStorageKey,
      widthPx,
      heightPx,
      durationMs: Math.round(spec.targetDurationSec * 1000),
      hasAudio: spec.voiceoverOutputRef !== null,
    };
  }
}
