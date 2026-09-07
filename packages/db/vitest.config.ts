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
    // Found via a genuine clean-clone verification run (cold caches, full
    // 9-package turbo `pnpm test` in flight at once): pglite-harness.test.ts's
    // beforeAll (WASM init + full migration replay) blew through the prior
    // 90000ms hookTimeout under that heavier contention, even though it
    // passes reliably well inside it on a warm/idle machine. `forks` alone
    // doesn't stop other __tests__ files in this same package from starting
    // concurrently and competing for CPU with the WASM engine's init;
    // fileParallelism: false plus a larger hookTimeout (set on the test
    // itself, see pglite-harness.test.ts) removes that source of variance
    // instead of just papering over one bad run with a bigger number.
    fileParallelism: false,
  },
});
