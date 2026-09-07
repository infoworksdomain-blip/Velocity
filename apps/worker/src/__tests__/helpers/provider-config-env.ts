import { fileURLToPath } from "node:url";

/**
 * `FileProviderConfigSource` defaults to `config/providers.json` relative
 * to the process's CWD — fine for the real worker process (started from
 * the repo root), wrong for vitest (CWD is apps/worker). Point it at the
 * real repo-root config file explicitly for tests, rather than adding a
 * test-only config-loading code path to the activity layer.
 */
export function useRealProviderConfigForTests(): void {
  process.env.VELOCITY_PROVIDERS_CONFIG = fileURLToPath(new URL("../../../../../config/providers.json", import.meta.url));
}
