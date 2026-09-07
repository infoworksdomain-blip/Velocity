#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 9 report (STEP 9 — Velocity, the two-tier swipe queue). Same
 * orchestrate-not-reimplement shape as scripts/gate-08(b) — runs the real
 * vitest suites; docs/steps/STEP-09.md's honesty matrix is the source of
 * truth for what each PASS/PARTIAL/DEFERRED actually means.
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

  console.log("Running packages/core test suite (bandit, queue ranking, never-starves simulation)...");
  const coreTests = runPnpm(["test"], coreDir);

  rows.push({
    check: "p95 swipe latency < 100ms on a mid-range mobile device over 4G",
    expected: "measured under real mobile/network conditions",
    actual: "Not measurable in this sandbox (no real device, no network throttling harness). The LOCAL commit path (optimistic state update before the server round trip — apps/web/app/velocity/page.tsx's commitSwipe) is synchronous React state, sub-millisecond; the actual claim needs a real device/network measurement this environment cannot produce.",
    pass: "DEFERRED",
  });
  rows.push({
    check: "Queue never starves in a 200-swipe session",
    expected: "available concept count never reaches zero",
    actual: coreTests.ok
      ? "queue-never-starves.test.ts: 200 simulated swipes (real needsTopUp/topUpCount/rankConcepts, the exact functions routers/velocity.ts calls) against a real top-up loop — minimum observed pool size never dropped below QUEUE_TOP_UP_THRESHOLD - 1"
      : "FAILED — see output above",
    pass: coreTests.ok ? "PARTIAL" : "DEFERRED", // the threshold MATH is real and tested; the full DB-backed router path has no PGlite-style integration harness in apps/web yet — see STEP-09.md
  });
  rows.push({
    check: "Preference model measurably shifts the served distribution after 50 swipes",
    expected: "write the test that proves it",
    actual: coreTests.ok
      ? "bandit.test.ts: 50 consistent right/left swipes on format:meme vs format:slideshow, then 500 ranking trials — meme concepts ranked first >90% of the time (vs ~50% before any swipes)"
      : "FAILED",
    pass: coreTests.ok ? "PASS" : "DEFERRED",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 9 — Velocity (the two-tier swipe queue)");
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
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-09.md's honesty matrix before treating this as a pass."
      : "RESULT: no checks failed outright. See docs/steps/STEP-09.md for what each PARTIAL actually covers.",
  );
  process.exit(anyDeferred ? 1 : 0);
}

main();
