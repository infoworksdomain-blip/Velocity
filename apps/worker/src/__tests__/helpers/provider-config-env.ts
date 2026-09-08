import { fileURLToPath } from "node:url";
import { FileProviderConfigSource } from "@velocity/providers";
import { setProviderConfigSourceForTests } from "../../temporal/activities/context.js";

/**
 * `FileProviderConfigSource` (and, since STEP 8B, `loadSafeAreasConfig`)
 * default to a repo-root-relative config path — fine for the real worker
 * process (started from the repo root), wrong for vitest (CWD is
 * apps/worker). Point both at the real repo-root config files explicitly
 * for tests, rather than adding a test-only config-loading code path to
 * the activity layer.
 *
 * Also points `getProviderRegistry()` at a plain `FileProviderConfigSource`
 * rather than STEP 18's `DbProviderConfigSource` default — these
 * render/publish-workflow tests exercise the pipeline's own logic (crash-
 * resume, concurrency, provenance), not STEP 18's DB-backed admin overlay,
 * so they shouldn't need a live admin DB connection just to construct a
 * registry. STEP 18's own overlay/TTL behaviour is proven directly in
 * packages/providers/src/router/__tests__/registry.test.ts and
 * apps/worker's db-provider-config-source test instead.
 */
export function useRealProviderConfigForTests(): void {
  process.env.VELOCITY_PROVIDERS_CONFIG = fileURLToPath(new URL("../../../../../config/providers.json", import.meta.url));
  process.env.VELOCITY_SAFE_AREAS_CONFIG = fileURLToPath(new URL("../../../../../config/safe-areas.json", import.meta.url));
  setProviderConfigSourceForTests(() => new FileProviderConfigSource());
}
