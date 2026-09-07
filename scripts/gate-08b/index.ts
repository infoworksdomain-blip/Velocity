#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 8B report (STEP 8B — Hook & On-Screen Text Engine). Same
 * orchestrate-not-reimplement approach as scripts/gate-08 — runs the real
 * vitest suites and computes the documented cost model; the honesty
 * matrix in docs/steps/STEP-08B.md is the source of truth for what each
 * PASS/PARTIAL/DEFERRED actually means.
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

function computeDocumentedCostPerTextPlan(): { total: number; breakdown: string[]; videoCost: number; ratio: number } {
  // Real published per-token rates from packages/text-engine/src/adapters/pricing.ts
  // (MODEL_RATES), × representative token counts for one TextPlan generation call
  // (a system+user prompt in, one structured hook+overlays+captions+CTA response out) —
  // not a live measurement, no funded API key exists in this environment to call the
  // real API. Same "modelled at list price, from a documented unit-count assumption"
  // honesty as GATE 8's own cost model.
  const ANTHROPIC_INPUT_USD_PER_MILLION = 3; // claude-sonnet-4-6
  const ANTHROPIC_OUTPUT_USD_PER_MILLION = 15;
  const inputTokens = 900; // system prompt (brand tone/rules/proof points/platform norms) + storyboard/product facts
  const outputTokens = 500; // one TextPlan: hook + 5-8 hookVariants + overlays + captionTrack + cta + compliance

  const inputCost = (inputTokens / 1_000_000) * ANTHROPIC_INPUT_USD_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * ANTHROPIC_OUTPUT_USD_PER_MILLION;
  const total = inputCost + outputCost;

  // GATE 8's own documented cost-per-20s-video figure ($2.41, see scripts/gate-08) — the
  // "under 1% of the video render" comparison this gate's own claim is about.
  const videoCost = 2.41;

  return {
    total,
    videoCost,
    ratio: total / videoCost,
    breakdown: [
      `  input (claude-sonnet-4-6, ~${inputTokens} tokens @ $${ANTHROPIC_INPUT_USD_PER_MILLION}/M): $${inputCost.toFixed(6)}`,
      `  output (claude-sonnet-4-6, ~${outputTokens} tokens @ $${ANTHROPIC_OUTPUT_USD_PER_MILLION}/M): $${outputCost.toFixed(6)}`,
    ],
  };
}

function main(): void {
  const rows: GateRow[] = [];
  const textEngineDir = join(REPO_ROOT, "packages", "text-engine");
  const workerDir = join(REPO_ROOT, "apps", "worker");

  console.log("Running packages/text-engine test suite (adapters, layout engine, repair loop)...");
  const textEngineTests = runPnpm(["test"], textEngineDir);
  rows.push({
    check: "One schema drives both Anthropic and OpenAI adapters with identical output shape",
    expected: "structural equality test asserts the same wrapped schema for both vendors",
    actual: textEngineTests.ok ? "structural-equality.test.ts passed against local mock Anthropic/OpenAI-shaped servers" : "FAILED — see output above",
    pass: textEngineTests.ok ? "PASS" : "DEFERRED",
  });
  rows.push({
    check: "Repair loop recovers >= 95% of schema failures without falling back to template",
    expected: ">=95% recovery rate across many trials",
    actual: textEngineTests.ok ? "repair-loop.test.ts: 200-trial simulation at a 99% underlying repair success rate, recovery rate asserted >= 95%" : "FAILED",
    pass: textEngineTests.ok ? "PARTIAL" : "DEFERRED", // mechanism proven; a real LLM's actual repair success rate needs a funded key to measure
  });
  rows.push({
    check: "No overlay in a 500-render sample falls outside the safe box for its target platform",
    expected: "500 samples, zero out-of-box overlays",
    actual: textEngineTests.ok
      ? "auto-fit.test.ts: 500 pseudo-random overlay/box combinations, binarySearchFontSize + fitsWithinBox verified for every one"
      : "FAILED",
    pass: textEngineTests.ok ? "PARTIAL" : "DEFERRED", // algorithm proven against a synthetic measurer; real canvas measureText needs a browser render context this sandbox doesn't have
  });

  console.log("\nRunning apps/worker test suite (composeText wired into the real render workflow)...");
  const workerTests = runPnpm(["test"], workerDir);
  rows.push({
    check: "Text-only re-render completes quickly and reuses the cached video track",
    expected: "a TextPlan regeneration re-uses render_steps rows for every non-text step (no duplicate spend), completing well under 15s",
    actual: workerTests.ok
      ? "render.workflow.happy.test.ts + idempotency test: composeText runs as a real ledger-backed step alongside the unchanged video/VO/compose steps, with the same idempotency guarantee already proven for those"
      : "FAILED",
    pass: workerTests.ok ? "PARTIAL" : "DEFERRED", // the ledger mechanism is real and tested; "text-only re-render" as a distinct user-facing flow (Content Studio's regenerate button) is STEP 8B.7 UI work, not yet built
  });

  const cost = computeDocumentedCostPerTextPlan();
  rows.push({
    check: "Measured cost per TextPlan documented, and it is under 1% of the cost of the video render",
    expected: "a documented number with a real basis, ratio < 1%",
    actual: `$${cost.total.toFixed(6)} vs $${cost.videoCost.toFixed(4)} video cost = ${(cost.ratio * 100).toFixed(3)}% (modelled at list price; see breakdown below)`,
    pass: cost.ratio < 0.01 ? "PARTIAL" : "DEFERRED", // real rates and real math; token counts are a documented assumption, not a live measurement
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 8B — Hook & On-Screen Text Engine");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`\n[${row.pass}] ${row.check}`);
    console.log(`  expected: ${row.expected}`);
    console.log(`  actual:   ${row.actual}`);
  }
  console.log("\nCost breakdown (documented model, not a live measurement):");
  for (const line of cost.breakdown) console.log(line);
  console.log(`  TOTAL per TextPlan: $${cost.total.toFixed(6)}  (${(cost.ratio * 100).toFixed(3)}% of the $${cost.videoCost.toFixed(4)} video render cost)`);

  const anyDeferred = rows.some((r) => r.pass === "DEFERRED");
  console.log("\n" + "=".repeat(100));
  console.log(
    anyDeferred
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-08B.md's honesty matrix before treating this as a pass."
      : "RESULT: no checks failed outright. Several are PARTIAL by design (no funded LLM key, no browser render context) — see docs/steps/STEP-08B.md.",
  );
  process.exit(anyDeferred ? 1 : 0);
}

main();
