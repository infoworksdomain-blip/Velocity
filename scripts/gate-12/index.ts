#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 12 report (STEP 12 — Publishing). Same orchestrate-not-reimplement
 * shape as scripts/gate-08(b)/09/10/11 — runs the real vitest suites;
 * docs/steps/STEP-12.md's honesty matrix is the source of truth for what
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

  console.log("Running packages/core test suite (preflight, taxonomy, publish adapters)...");
  const coreTests = runPnpm(["test"], coreDir);

  console.log("\nBuilding apps/worker (Temporal loads compiled workflow output, not source)...");
  const workerBuild = runPnpm(["build"], workerDir);

  console.log("\nRunning apps/worker's publish workflow tests (real Temporal + real embedded Postgres)...");
  const workerTests = workerBuild.ok
    ? runPnpm(["exec", "vitest", "run", "src/__tests__/publish.workflow.happy.test.ts", "src/__tests__/publish.workflow.idempotency.test.ts", "src/__tests__/publish.workflow.duplicate-trigger.test.ts", "src/__tests__/publish.workflow.preflight-failures.test.ts"], workerDir)
    : { ok: false };

  const allOk = coreTests.ok && workerBuild.ok && workerTests.ok;

  rows.push({
    check: "50 scheduled posts publish across three platforms with zero duplicates, zero cap breaches, correct AI labels",
    expected: "a real 50-post batch run across TikTok/Instagram/YouTube with no duplicate platform posts, no account exceeding its quota cap, and the right AI-generated label sent per platform",
    actual: allOk
      ? "Each guarantee is real and independently tested, not run as one literal 50-post batch (that would need live, audited platform credentials this sandbox doesn't have — the same gap as every publish adapter itself). Zero duplicates: publish.workflow.duplicate-trigger.test.ts proves the workflow-id REJECT_DUPLICATE dedupe rejects a second trigger for the same publication outright. Zero cap breaches: publish.workflow.preflight-failures.test.ts proves an exhausted-quota account is rejected in preflight before any vendor call, built on GATE 11's own real 20-way-concurrent atomic-UPSERT proof. Correct AI labels: adapter tests confirm is_ai_generated (Instagram) and containsSyntheticMedia (YouTube) are sent as real, documented API parameters; record.ts's aiLabelSet logic is exercised end-to-end in publish.workflow.happy.test.ts (TikTok path)."
      : "FAILED — see output above",
    pass: allOk ? "PARTIAL" : "DEFERRED",
  });
  rows.push({
    check: "Chaos test: kill workers mid-publish; nothing double-posts",
    expected: "a worker crash between platformInit and poll resumes against the SAME externalJobId, never re-initiating a second vendor-side draft/container/session",
    actual: allOk
      ? "publish.workflow.idempotency.test.ts (real Temporal + real embedded Postgres): a poll call that throws once (simulating a worker dying mid-poll) forces Temporal to retry the poll activity from scratch; the TikTok init endpoint is asserted called exactly once despite the retry, and the publication_steps ledger row shows a single succeeded platform_init claim — the same mechanism (and the same style of proof) as GATE 8's render-pipeline idempotency claim."
      : "FAILED",
    pass: allOk ? "PASS" : "DEFERRED",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 12 — Publishing");
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
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-12.md's honesty matrix before treating this as a pass."
      : "RESULT: no checks failed outright. See docs/steps/STEP-12.md for what the PARTIAL actually covers (a real 50-post live batch needs funded/audited platform credentials this sandbox doesn't have).",
  );
  process.exit(anyDeferred ? 1 : 0);
}

main();
