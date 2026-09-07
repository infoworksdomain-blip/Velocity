/**
 * Same CWD-relative-path pattern (and same fix) as @velocity/providers'
 * FileProviderConfigSource (STEP 8): the production default resolves
 * relative to the process's working directory (correct when the worker
 * actually runs from the repo root, e.g. `pnpm dev`/a deployed container),
 * and tests override via an absolute path through the env var — vitest's
 * CWD is the package directory, not the repo root, which bit STEP 8's own
 * provider config loading before this same fix was applied there.
 */
export function resolveSafeAreasConfigPath(): string {
  return process.env.VELOCITY_SAFE_AREAS_CONFIG ?? "config/safe-areas.json";
}

export function resolvePlatformMediaSpecsConfigPath(): string {
  return process.env.VELOCITY_PLATFORM_MEDIA_SPECS_CONFIG ?? "config/platform-media-specs.json";
}
