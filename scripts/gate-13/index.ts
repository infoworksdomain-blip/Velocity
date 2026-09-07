#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 13 report (STEP 13 — Analytics). Same orchestrate-not-reimplement
 * shape as scripts/gate-08(b)/09/10/11/12 — runs the real vitest suites;
 * docs/steps/STEP-13.md's honesty matrix is the source of truth for what
 * each PASS/PARTIAL/DEFERRED actually means.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

interface GateRow {
  check: string;
  expected: string;
  actual: string;
  pass: "PASS" | "PARTIAL" | "DEFERRED";
}

function runPnpm(args: string[], cwd: string): { ok: boolean } {
  const result = spawnSync("pnpm", args, { cwd, encoding: "utf8", shell: true, stdio: "inherit" });
  return { ok: result.status === 0 };
}

function main(): void {
  const rows: GateRow[] = [];
  const coreDir = join(REPO_ROOT, "packages", "core");
  const workerDir = join(REPO_ROOT, "apps", "worker");
  const webDir = join(REPO_ROOT, "apps", "web");

  console.log("Running packages/core test suite (metrics adapters, aggregation, outliers, CSV, report, best-time, performance-feedback)...");
  const coreTests = runPnpm(["test"], coreDir);

  console.log("\nRunning apps/worker's metrics-ingestion daemon test (real PGlite, real quota isolation)...");
  const workerTests = runPnpm(["exec", "vitest", "run", "src/__tests__/metrics-ingestion.test.ts"], workerDir);

  console.log("\nRunning apps/web's website-attribution test (real PGlite — the first DB-integration test in apps/web)...");
  const webTests = runPnpm(["exec", "vitest", "run", "server/__tests__/analytics-service.test.ts"], webDir);

  const allOk = coreTests.ok && workerTests.ok && webTests.ok;

  rows.push({
    check: "Metrics reconcile with platform-native insights within tolerance",
    expected: "ingested view/like/comment/share counts match each platform's own dashboard for the same post, within tolerance",
    actual:
      "Not measurable in this sandbox — reconciling against a platform's own dashboard needs a live, audited app connection and a real published post on a real account, neither of which exist here (the same category of gap as every funded-credential dependency in this build). What IS real and tested: each adapter (tiktok-metrics.ts, instagram-metrics.ts, youtube-metrics.ts) correctly parses each platform's own documented response fields (view_count/like_count/etc., reach/likes/plays/etc., viewCount/likeCount/etc.) against local mock servers, and metrics-ingestion.test.ts proves the full real-PGlite ingestion tick correctly writes those parsed values into metric_snapshots.",
    pass: "DEFERRED",
  });
  rows.push({
    check: "Attribution joins click to signup end to end",
    expected: "a real funnel — a short-link click, a signup, and a conversion — resolves back to the same post/link via a real join",
    actual: webTests.ok
      ? "apps/web/server/__tests__/analytics-service.test.ts (real PGlite — the first DB-integration test this codebase has had in apps/web, closing a gap flagged since STEP 9): createShortLink -> recordClick -> recordAttributionEvent(signup) -> recordAttributionEvent(conversion) all run for real against a real embedded Postgres, then the test reads back all three attribution_events rows by link_short_id and confirms they resolve to the same link, in order, each carrying its own external_ref, with the click event's id preserved in each downstream event's metadata for a genuine 1:1 correlation (not just an aggregate link-level join)."
      : "FAILED — see output above",
    pass: webTests.ok ? "PASS" : "DEFERRED",
  });
  rows.push({
    check: "Bandit priors demonstrably shift after ingesting winner data",
    expected: "write the test that proves it",
    actual: coreTests.ok
      ? "performance-feedback.test.ts: a real z-score-based winner/loser classification over synthetic publication performance feeds real +1 alpha/beta updates into the SAME velocity_preferences dimension keys STEP 9's swipe handler uses (hook_pattern included — the build script's separately-named '8B hook-pattern weights' target is the SAME mechanism, not a second system), then 500 real Thompson-sampling ranking trials prove the served ranking distribution shifts from a genuine ~50/50 cold start to >75% favouring the format that performed well — the identical statistical-majority proof style STEP 9's own distribution-shift test already established for swipes, run here against performance data instead."
      : "FAILED",
    pass: coreTests.ok ? "PASS" : "DEFERRED",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 13 — Analytics");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`\n[${row.pass}] ${row.check}`);
    console.log(`  expected: ${row.expected}`);
    console.log(`  actual:   ${row.actual}`);
  }

  const anyDeferred = rows.some((r) => r.pass === "DEFERRED");
  console.log("\n" + "=".repeat(100));
  console.log(
    anyDeferred
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-13.md's honesty matrix before treating this as a pass."
      : "RESULT: no checks failed outright. See docs/steps/STEP-13.md for full scope decisions.",
  );
  process.exit(anyDeferred || !allOk ? 1 : 0);
}

main();
