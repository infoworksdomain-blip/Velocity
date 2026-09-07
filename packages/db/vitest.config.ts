import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    testTimeout: 10000,
    // PGlite (pglite-harness.test.ts) is a WASM Postgres engine. Running it
    // in vitest's default worker_threads pool caused a hard crash ("Worker
    // exited unexpectedly", raw V8/native stack frames) specifically when
    // this package's tests ran as part of the full monorepo `pnpm test`
    // alongside other packages' concurrent test processes — not when run
    // alone. `pool: "forks"` runs test files in real child processes
    // instead of threads, which is more robust for a WASM runtime under
    // shared-machine load.
    pool: "forks",
  },
});
