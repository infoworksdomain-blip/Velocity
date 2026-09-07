import { fileURLToPath } from "node:url";

/**
 * `FileProviderConfigSource` (and, since STEP 8B, `loadSafeAreasConfig`)
 * default to a repo-root-relative config path — fine for the real worker
 * process (started from the repo root), wrong for vitest (CWD is
 * apps/worker). Point both at the real repo-root config files explicitly
 * for tests, rather than adding a test-only config-loading code path to
 * the activity layer.
 */
export function useRealProviderConfigForTests(): void {
  process.env.VELOCITY_PROVIDERS_CONFIG = fileURLToPath(new URL("../../../../../config/providers.json", import.meta.url));
  process.env.VELOCITY_SAFE_AREAS_CONFIG = fileURLToPath(new URL("../../../../../config/safe-areas.json", import.meta.url));
}
