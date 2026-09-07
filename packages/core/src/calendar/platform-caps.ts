import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * C6: "Platform rate caps enforced client-side. The scheduler must never
 * emit a request that would breach a documented platform cap. Caps live
 * in config, not code." — config/platform-caps.json, real published
 * numbers (see that file's own per-platform notes for sourcing).
 */
export const PlatformCapSchema = z.object({
  postsPerRollingWindow: z.number().int().positive(),
  windowHours: z.number().int().positive(),
  minSpacingMinutes: z.number().int().nonnegative(),
  note: z.string(),
});
export type PlatformCap = z.infer<typeof PlatformCapSchema>;

export const PlatformCapsConfigSchema = z.object({
  version: z.literal(1),
  caps: z.record(z.string(), PlatformCapSchema),
  defaultMinSpacingMinutes: z.number().int().nonnegative(),
});
export type PlatformCapsConfig = z.infer<typeof PlatformCapsConfigSchema>;

let cachedConfig: PlatformCapsConfig | null = null;

/** Same CWD-relative-path-with-env-override pattern established for config/providers.json (STEP 8) and config/safe-areas.json (STEP 8B) — production resolves relative to the repo root (the real process's CWD); tests override via an absolute path. */
export function loadPlatformCapsConfig(absolutePath: string): PlatformCapsConfig {
  if (cachedConfig) return cachedConfig;
  const raw = JSON.parse(readFileSync(absolutePath, "utf-8"));
  cachedConfig = PlatformCapsConfigSchema.parse(raw);
  return cachedConfig;
}

export function resetPlatformCapsConfigForTests(): void {
  cachedConfig = null;
}

export function capFor(config: PlatformCapsConfig, platform: string): PlatformCap {
  const cap = config.caps[platform];
  if (!cap) throw new Error(`No platform cap configured for "${platform}"`);
  return cap;
}
