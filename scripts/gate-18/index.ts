#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 18 report (STEP 18 — Admin). Same orchestrate-not-reimplement
 * shape as scripts/gate-08...17 — runs the real vitest suites;
 * docs/steps/STEP-18.md's honesty matrix is the source of truth for what
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
  const providersDir = join(REPO_ROOT, "packages", "providers");
  const workerDir = join(REPO_ROOT, "apps", "worker");
  const webDir = join(REPO_ROOT, "apps", "web");

  console.log("Running packages/core's admin + preflight test suites (audit trail, feature-flag precedence, risk rules, platform pause)...");
  const coreTests = runPnpm(["exec", "vitest", "run", "src/admin", "src/publish/__tests__/preflight.test.ts"], coreDir);

  console.log("\nRunning packages/providers' registry TTL-reload test...");
  const providersTests = runPnpm(["exec", "vitest", "run", "src/router/__tests__/registry.test.ts"], providersDir);

  console.log("\nRunning apps/worker's DbProviderConfigSource + publish-preflight-failures tests (real PGlite + real Temporal)...");
  const workerTests = runPnpm(["exec", "vitest", "run", "src/__tests__/db-provider-config-source.test.ts", "src/__tests__/publish.workflow.preflight-failures.test.ts"], workerDir);

  console.log("\nRunning apps/web's admin-service test (real PGlite)...");
  const webTests = runPnpm(["exec", "vitest", "run", "server/__tests__/admin-service.test.ts"], webDir);

  const allOk = coreTests.ok && providersTests.ok && workerTests.ok && webTests.ok;

  rows.push({
    check: "Every destructive admin action is audit-logged with actor/target/before-after",
    expected: "suspending/unsuspending a user, archiving/unarchiving a workspace, editing an AI provider config, upserting a feature flag, resolving a moderation review, and toggling a platform pause each write a real audit_logs row with the actor, target, and before/after state",
    actual: webTests.ok
      ? "admin-service.test.ts (real PGlite): every mutating admin-service function is proven to write exactly one audit_logs row per call, with the real actorUserId and a before/after snapshot that actually differs (not a placeholder) -- reusing STEP 14's writeAuditLog, the same shared writer STEP 15/16/17 already proved for their own destructive actions."
      : "FAILED — see output above",
    pass: webTests.ok ? "PASS" : "DEFERRED",
  });

  rows.push({
    check: "Feature flags evaluate per workspace and per user",
    expected: "a flag can be overridden at the workspace level, the user level, or both together, with the most-specific tier always winning, and the platform default as the fallback",
    actual: coreTests.ok && webTests.ok
      ? "feature-flags.test.ts (packages/core): the pure resolveFeatureFlag precedence (exact workspace+user -> user-only -> workspace-only -> global) is proven for every tier combination, including that an unrelated workspace/user never sees another's override. admin-service.test.ts (real PGlite): the same precedence is proven end to end against real upserted rows via evaluateFeatureFlag, including that re-upserting the same scope updates the row rather than duplicating it. The 'global pause' mechanism (platform_pause:<platform> convention key) reuses this exact system rather than new infrastructure."
      : "FAILED",
    pass: coreTests.ok && webTests.ok ? "PASS" : "DEFERRED",
  });

  rows.push({
    check: "A model kill switch takes effect within 60 seconds, without a deploy",
    expected: "flipping a provider's enabled/weight/breaker settings (or the router-wide fallback chain / cost ceilings) in the database reaches every worker process's routing decisions within 60 seconds, with no restart",
    actual: providersTests.ok && workerTests.ok
      ? "registry.test.ts (packages/providers): ProviderRegistry.ensureLoaded() re-reads its config source once a 30s TTL (comfortably under the 60s bound) elapses -- proven with a fast-forwarded injectable clock, no real wall-clock wait, including that a config change made mid-TTL is served stale until exactly the TTL boundary and picked up immediately after. db-provider-config-source.test.ts (apps/worker, real PGlite): DbProviderConfigSource overlays real ai_provider_configs/ai_router_settings rows onto the file source -- proven that migration 0022's seed rows exactly reproduce config/providers.json (no silent behaviour change on cutover), that a DB row overrides enabled/weight/adapter/breaker but never the file's credentials, and that ai_router_settings' singleton row overrides the fallback chain length and every cost ceiling. publish.workflow.preflight-failures.test.ts (apps/worker, real Temporal + real PGlite): a real feature_flags platform_pause row blocks an actual publish workflow run end to end, with zero vendor calls -- the SEPARATE, immediate (no TTL) kill-switch path for pausing a whole platform outright."
      : "FAILED",
    pass: providersTests.ok && workerTests.ok ? "PASS" : "DEFERRED",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 18 — Admin");
  console.log("=".repeat(100));
  for (const row of rows) {
    console.log(`\n[${row.pass}] ${row.check}`);
    console.log(`  expected: ${row.expected}`);
    console.log(`  actual:   ${row.actual}`);
  }

  const anyNotPass = rows.some((r) => r.pass !== "PASS");
  console.log("\n" + "=".repeat(100));
  console.log(
    anyNotPass
      ? "RESULT: one or more checks did not fully PASS — see docs/steps/STEP-18.md's honesty matrix before treating this as a pass."
      : "RESULT: all three GATE 18 checks pass for real. See docs/steps/STEP-18.md for full scope decisions (illustrative disposable-email/public-figure-style seed lists, limited multi-account signal, deferred audit-log/moderation UI polish).",
  );
  process.exit(anyNotPass || !allOk ? 1 : 0);
}

main();
