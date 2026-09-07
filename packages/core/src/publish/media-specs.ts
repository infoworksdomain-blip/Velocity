import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Real published per-platform media constraints (STEP 12 preflight's
 * "validate spec compliance per platform" check) — config/platform-media-
 * specs.json, same CWD-relative-path-with-env-override pattern as
 * config/platform-caps.json (STEP 10).
 */
export const PlatformMediaSpecSchema = z.object({
  maxDurationMs: z.number().int().positive(),
  minDurationMs: z.number().int().positive(),
  aspectRatio: z.string(),
  note: z.string(),
});
export type PlatformMediaSpec = z.infer<typeof PlatformMediaSpecSchema>;

export const PlatformMediaSpecsConfigSchema = z.object({
  version: z.literal(1),
  specs: z.record(z.string(), PlatformMediaSpecSchema),
});
export type PlatformMediaSpecsConfig = z.infer<typeof PlatformMediaSpecsConfigSchema>;

let cachedConfig: PlatformMediaSpecsConfig | null = null;

export function loadPlatformMediaSpecsConfig(absolutePath: string): PlatformMediaSpecsConfig {
  if (cachedConfig) return cachedConfig;
  const raw = JSON.parse(readFileSync(absolutePath, "utf-8"));
  cachedConfig = PlatformMediaSpecsConfigSchema.parse(raw);
  return cachedConfig;
}

export function resetPlatformMediaSpecsConfigForTests(): void {
  cachedConfig = null;
}

export function mediaSpecFor(config: PlatformMediaSpecsConfig, platform: string): PlatformMediaSpec {
  const spec = config.specs[platform];
  if (!spec) throw new Error(`No platform media spec configured for "${platform}"`);
  return spec;
}
