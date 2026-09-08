import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    // STEP 16 found the same real contention class packages/db/vitest.config.ts
    // and apps/worker/vitest.config.ts already document: apps/web now has 7
    // real PGlite-spinning `// @vitest-environment node` test files (STEP
    // 13-16's DB-integration tests), and running them concurrently in a
    // genuinely cold clean-clone environment (no warm OS file cache, first-
    // time PGlite WASM init per worker) blew through several files'
    // beforeAll hookTimeout — a real, reproducible test-environment ceiling
    // under cold-cache contention, not a logic defect in the code under
    // test (every affected suite passes reliably when run warm or in
    // isolation, and DID pass earlier this same session under those
    // conditions). `pool: "forks"` + `fileParallelism: false` is the exact
    // fix already proven for this failure mode elsewhere in this monorepo.
    pool: "forks",
    fileParallelism: false,
  },
});
