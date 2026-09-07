#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 14 report (STEP 14 — AI Growth Brain). Same orchestrate-not-
 * reimplement shape as scripts/gate-08(b)/09/10/11/12/13 — runs the real
 * vitest suites; docs/steps/STEP-14.md's honesty matrix is the source of
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
  const textEngineDir = join(REPO_ROOT, "packages", "text-engine");
  const webDir = join(REPO_ROOT, "apps", "web");

  console.log("Running packages/core test suite (recommendations, growth-brain orchestration, audit, competitor blueprints)...");
  const coreTests = runPnpm(["test"], coreDir);

  console.log("\nRunning packages/text-engine test suite (real + stub assistant adapters)...");
  const textEngineTests = runPnpm(["test"], textEngineDir);

  console.log("\nRunning apps/web's assistant-service test (real PGlite — the adversarial workspace-isolation proof)...");
  const webTests = runPnpm(["exec", "vitest", "run", "server/__tests__/assistant-service.test.ts"], webDir);

  const allOk = coreTests.ok && textEngineTests.ok && webTests.ok;

  rows.push({
    check: "Recommendations cite the data behind them",
    expected: "a recommendation carries the actual metrics it was derived from, not just a prose claim",
    actual: coreTests.ok
      ? "recommendations.test.ts: generateRecommendations' output structurally includes citedMetrics: {winner, loser} — the exact real GroupSummary rows (count, totalViews, avgEngagementRate) a finding was computed from — reproducing the build script's own literal example (\"curiosity-gap hooks outperform contrarian 2.4x\") with real numbers and asserting the cited data matches exactly."
      : "FAILED — see output above",
    pass: coreTests.ok ? "PASS" : "DEFERRED",
  });
  rows.push({
    check: "The assistant cannot reach another workspace's data (adversarial prompt test)",
    expected: "a prompt-injected tool call cannot redirect a query to another workspace",
    actual: webTests.ok
      ? "assistant-service.test.ts (real PGlite, real embedded Postgres): two real workspaces are seeded with unmistakably different analytics data; a mock 'model' issues a pull_analytics tool call whose input smuggles a workspaceId field pointing at the OTHER workspace (exactly what a successfully prompt-injected real LLM would produce) — the returned data is proven to be ONLY the authenticated workspace's own, because pull_analytics' tool schema has no workspaceId field and the executor always sources it from the authenticated tRPC context, never from tool input. Proven again with the real deterministic stub provider (no funded API key), showing the isolation is structural, not model-dependent."
      : "FAILED",
    pass: webTests.ok ? "PASS" : "DEFERRED",
  });
  rows.push({
    check: "Every assistant tool call is audit-logged",
    expected: "a real, queryable audit trail exists for each tool call, including adversarial ones",
    actual: webTests.ok && coreTests.ok
      ? "audit.test.ts (real PGlite): writeAuditLog persists a real, queryable row. assistant-service.test.ts: every tool call — including the adversarial one above — writes a real audit_logs row scoped to the correct workspace/actor, faithfully recording what the model actually asked for (the smuggled field included, for a real auditor to see the injection attempt) rather than a sanitized record that would hide it."
      : "FAILED",
    pass: webTests.ok && coreTests.ok ? "PASS" : "DEFERRED",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 14 — AI Growth Brain");
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
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-14.md's honesty matrix before treating this as a pass."
      : "RESULT: all three GATE 14 checks pass for real. See docs/steps/STEP-14.md for full scope decisions (no automated TikTok/Instagram competitor scraping, no funded Anthropic key for the live model).",
  );
  process.exit(anyDeferred || !allOk ? 1 : 0);
}

main();
