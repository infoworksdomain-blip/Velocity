/**
 * Loudness normalisation to -14 LUFS (STEP 8.4). A real implementation
 * shells out to ffmpeg's loudnorm filter — no ffmpeg binary is available
 * in this environment (verified: `ffmpeg -version` fails). `PassThroughNormaliser`
 * is the honest stand-in: it does not fabricate a LUFS measurement, it
 * marks the step as skipped so that fact is visible in render_steps.output
 * rather than silently reporting success for work that didn't happen.
 */
export interface LoudnessNormaliser {
  normalise(inputStorageKey: string): Promise<{ outputStorageKey: string; measuredLufs: number | null; skipped: boolean }>;
}

export class PassThroughNormaliser implements LoudnessNormaliser {
  async normalise(inputStorageKey: string) {
    return { outputStorageKey: inputStorageKey, measuredLufs: null, skipped: true };
  }
}
