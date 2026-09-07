import { defineConfig } from "vitest/config";

/**
 * A separate config for the one test vitest.config.ts's own `exclude`
 * deliberately excludes from the default run (see that file's comment).
 * `exclude` always wins over a CLI positional file argument in vitest — it
 * does not narrow an otherwise-excluded file back in, it only filters
 * among files the base `include`/`exclude` already selected — so running
 * this file via `vitest run <path>` against the default config was
 * silently a no-op ("No test files found"), not the isolated run it
 * looked like. This config `include`s ONLY the concurrency test and
 * excludes nothing, so `pnpm test:concurrency` actually runs it.
 */
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: "forks",
    poolOptions: { forks: { singleFork: false } },
    include: ["src/__tests__/render.workflow.concurrency.test.ts"],
  },
});
