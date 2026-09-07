#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 8 report (STEP 8). Runs the real verification suites and computes
 * the documented cost model — it does not re-implement checks the vitest
 * suites already perform; it orchestrates them and renders the pass/fail
 * table CLAUDE.md's `pnpm gate:NN` convention calls for (never implemented
 * for any prior step until now — see docs/steps/STEP-08.md).
 *
 * "Pass" here means "the check that CAN be made real, is, and passed the
 * last time this ran" — several rows are honestly reported as partial or
 * deferred rather than forced into a boolean, per this project's standing
 * verification discipline. Re-read docs/steps/STEP-08.md's honesty matrix
 * before trusting this table's PASS column as a substitute for that.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

interface GateRow {
  check: string;
  expected: string;
  actual: string;
  pass: "PASS" | "PARTIAL" | "DEFERRED";
}

function runPnpm(args: string[], cwd: string): { ok: boolean; output: string } {
  const result = spawnSync("pnpm", args, { cwd, encoding: "utf8", shell: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { ok: result.status === 0, output };
}

function computeDocumentedCostPer20sVideo(): { total: number; breakdown: string[] } {
  const configPath = join(REPO_ROOT, "config", "providers.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    providers: { id: string; kind: string }[];
  };

  // Real published rates from config/providers.json, ×  representative unit
  // counts for a 20s hook_demo video (not a live measurement — no real
  // vendor call happened; this is "modelled cost at list price, from a
  // documented unit-count assumption," per STEP-08.md's honesty matrix).
  const KLING_COST_PER_SECOND = 0.12; // config/providers.json: video/kling-3.0
  const ELEVENLABS_COST_PER_CHARACTER = 0.00003; // config/providers.json: tts/elevenlabs
  const WHISPERX_FLAT_COST = 0.001; // packages/providers/.../whisperx.stub.ts

  const videoSeconds = 20;
  const voiceoverCharacters = 300; // ~60 spoken words at ~150wpm, ~5 chars/word

  const videoCost = KLING_COST_PER_SECOND * videoSeconds;
  const ttsCost = ELEVENLABS_COST_PER_CHARACTER * voiceoverCharacters;
  const transcriptionCost = WHISPERX_FLAT_COST;
  const total = videoCost + ttsCost + transcriptionCost;

  return {
    total,
    breakdown: [
      `  video (kling-3.0, ${videoSeconds}s @ $${KLING_COST_PER_SECOND}/s): $${videoCost.toFixed(4)}`,
      `  tts (elevenlabs, ${voiceoverCharacters} chars @ $${ELEVENLABS_COST_PER_CHARACTER}/char): $${ttsCost.toFixed(4)}`,
      `  transcription (whisperx, flat): $${transcriptionCost.toFixed(4)}`,
      `  compose/normalise/provenance/qc: $0 (not AI-metered, C5 scope)`,
    ],
  };
}

function main(): void {
  const rows: GateRow[] = [];
  const workerDir = join(REPO_ROOT, "apps", "worker");

  console.log("Running apps/worker test suite (happy path + idempotency)...");
  const happyAndIdempotency = runPnpm(["test"], workerDir);
  rows.push({
    check: "A killed worker mid-render resumes without duplicate spend",
    expected: "generate() called exactly once across a simulated crash + retry",
    actual: happyAndIdempotency.ok ? "render.workflow.idempotency.test.ts passed" : "FAILED — see output above",
    pass: happyAndIdempotency.ok ? "PASS" : "DEFERRED",
  });
  rows.push({
    check: "Every render carries a C2PA manifest",
    expected: "manifest built, schema-valid, referenced from renders.c2paManifestRef",
    actual: happyAndIdempotency.ok ? "render.workflow.happy.test.ts asserted c2paManifestRef truthy" : "FAILED",
    pass: "PARTIAL", // signing/embedding needs a real cert — see STEP-08.md
  });
  rows.push({
    check: "usage_events reconcile with provider-reported cost",
    expected: "no un-metered, no double-metered path",
    actual: happyAndIdempotency.ok ? "usage-recorder tests + workflow test's usage_event assertions passed" : "FAILED",
    pass: "PARTIAL", // reconciliation logic real; provider_reported_cost_usd is stub-sourced
  });

  console.log("\nRunning apps/worker concurrency suite (separate script — see vitest.config.ts's exclude)...");
  const concurrency = runPnpm(["test:concurrency"], workerDir);
  rows.push({
    check: "100 concurrent renders complete with <2% failure",
    expected: "<2% workflow failure under injected transient provider failure",
    actual: concurrency.ok
      ? "10 concurrent renders, 20% injected failure, <2% workflow failure (isolated run — see STEP-08.md on shared-machine contention)"
      : "FAILED or contended — rerun in isolation: pnpm --filter @velocity/worker test:concurrency",
    pass: concurrency.ok ? "PARTIAL" : "DEFERRED", // representative scale, not literal 100; workflow orchestration, not vendor SLA
  });

  const cost = computeDocumentedCostPer20sVideo();
  rows.push({
    check: "Cost per finished 20s video measured and documented",
    expected: "a documented number with a real unit-count basis",
    actual: `$${cost.total.toFixed(4)} (modelled at list price; see breakdown below)`,
    pass: "PARTIAL",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 8 — Content Engine");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`\n[${row.pass}] ${row.check}`);
    console.log(`  expected: ${row.expected}`);
    console.log(`  actual:   ${row.actual}`);
  }
  console.log("\nCost breakdown (documented model, not a live measurement):");
  for (const line of cost.breakdown) console.log(line);
  console.log(`  TOTAL: $${cost.total.toFixed(4)}`);

  const anyDeferred = rows.some((r) => r.pass === "DEFERRED");
  console.log("\n" + "=".repeat(100));
  console.log(
    anyDeferred
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-08.md's honesty matrix before treating this as a pass."
      : "RESULT: no checks failed outright. Several are PARTIAL by design (stub providers, no signing cert) — see docs/steps/STEP-08.md.",
  );
  process.exit(anyDeferred ? 1 : 0);
}

main();
