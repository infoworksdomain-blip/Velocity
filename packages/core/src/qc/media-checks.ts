/**
 * Duration/aspect/audio checks (STEP 8.4's QC activity) — real logic
 * against a `MediaProbe` struct. Populating that struct from an actual
 * rendered file needs a real render (ffmpeg/Remotion); STEP 8's stub
 * compositor produces a correctly-*described* output (real dimensions and
 * duration numbers, derived from the ComposeSpec, not a real file), so
 * these checks run for real against real numbers even though no real
 * video bytes exist yet.
 */

export interface MediaProbe {
  widthPx: number;
  heightPx: number;
  durationMs: number;
  hasAudioTrack: boolean;
}

export interface TargetSpec {
  targetWidthPx: number;
  targetHeightPx: number;
  minDurationMs: number;
  maxDurationMs: number;
  requiresAudio: boolean;
}

export interface MediaCheckResult {
  passed: boolean;
  reasons: string[];
}

const ASPECT_TOLERANCE = 0.02;

export function checkDurationAndAspect(probe: MediaProbe, target: TargetSpec): MediaCheckResult {
  const reasons: string[] = [];

  const actualAspect = probe.widthPx / probe.heightPx;
  const targetAspect = target.targetWidthPx / target.targetHeightPx;
  if (Math.abs(actualAspect - targetAspect) > ASPECT_TOLERANCE) {
    reasons.push(`aspect ratio ${actualAspect.toFixed(3)} does not match target ${targetAspect.toFixed(3)}`);
  }

  if (probe.durationMs < target.minDurationMs) {
    reasons.push(`duration ${probe.durationMs}ms is below minimum ${target.minDurationMs}ms`);
  }
  if (probe.durationMs > target.maxDurationMs) {
    reasons.push(`duration ${probe.durationMs}ms exceeds maximum ${target.maxDurationMs}ms`);
  }

  return { passed: reasons.length === 0, reasons };
}

export function checkAudioPresence(probe: MediaProbe, target: TargetSpec): MediaCheckResult {
  if (target.requiresAudio && !probe.hasAudioTrack) {
    return { passed: false, reasons: ["audio track required but not present"] };
  }
  return { passed: true, reasons: [] };
}
