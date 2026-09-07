import type {
  ProviderJobHandle,
  ProviderJobStatus,
  TranscriptionJobInput,
  TranscriptionProvider,
  WordTiming,
} from "../../types.js";
import { DeterministicJobStore } from "../shared/deterministic-job-store.js";

/**
 * [UNVERIFIED FIXTURE — provider-adapter command] WhisperX (build script
 * line 251) — manifest is a stand-in, not a verified API spec.
 *
 * Stub-only convention: since there is no real audio file to transcribe,
 * `align`'s stub path encodes the VO script into the job's `audioUrl` as
 * `stub-vo://<encodeURIComponent(script)>` when it builds the
 * TranscriptionJobInput. This adapter decodes it back out to produce
 * genuinely deterministic word-level timings — real per-word durations
 * weighted by character length (a real, if crude, proxy for spoken
 * duration), not evenly-spaced placeholders. A real WhisperX adapter
 * ignores this convention entirely; it only ever sees a real audio URL.
 */
const PROVIDER_ID = "whisperx";
const STUB_VO_PREFIX = "stub-vo://";
const AVG_MS_PER_CHAR = 55;
const INTER_WORD_GAP_MS = 60;

export function encodeStubVoScript(script: string): string {
  return `${STUB_VO_PREFIX}${encodeURIComponent(script)}`;
}

function wordTimingsFromScript(script: string): WordTiming[] {
  const words = script.split(/\s+/).filter((w) => w.length > 0);
  const timings: WordTiming[] = [];
  let cursorMs = 0;
  for (const word of words) {
    const durationMs = Math.max(120, word.length * AVG_MS_PER_CHAR);
    timings.push({ word, startMs: cursorMs, endMs: cursorMs + durationMs });
    cursorMs += durationMs + INTER_WORD_GAP_MS;
  }
  return timings;
}

export function createWhisperXStubProvider(tiers: string[]): TranscriptionProvider {
  const store = new DeterministicJobStore(PROVIDER_ID, {
    processingMs: 80,
    costUsd: () => 0.001,
  });

  return {
    id: PROVIDER_ID,
    capabilities: {
      commercialUse: true,
      tiers,
      costPerSecond: 0.0002,
    },
    estimateCost() {
      return 0.001;
    },
    async transcribe(input: TranscriptionJobInput): Promise<ProviderJobHandle> {
      return store.generate(input);
    },
    async poll(handle: ProviderJobHandle): Promise<ProviderJobStatus & { words?: WordTiming[] }> {
      const result = store.poll(handle.externalJobId);
      if (result.state !== "succeeded" || !result.outputUrl) return result;

      // The stub store's outputUrl is its own synthetic "stub://provider/jobId" — the
      // *input* audioUrl (carrying the encoded script) isn't retrievable from the job
      // store alone, so the caller must decode words from the original input directly
      // when it needs them; this poll() only proves the job lifecycle. See align.ts
      // in apps/worker for how the two are combined in practice.
      return result;
    },
  };
}

export function decodeWordsIfStubVo(audioUrl: string): WordTiming[] | null {
  if (!audioUrl.startsWith(STUB_VO_PREFIX)) return null;
  const script = decodeURIComponent(audioUrl.slice(STUB_VO_PREFIX.length));
  return wordTimingsFromScript(script);
}
