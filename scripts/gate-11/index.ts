#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 11 report (STEP 11 — Social Integrations). Same
 * orchestrate-not-reimplement shape as scripts/gate-08(b)/09/10 — runs the
 * real vitest suites; docs/steps/STEP-11.md's honesty matrix is the source
 * of truth for what each PASS/PARTIAL/DEFERRED actually means.
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

  console.log("Running packages/core test suite (OAuth adapters, quota, token-refresh thresholds, oauth-state)...");
  const coreTests = runPnpm(["test"], coreDir);

  console.log("\nRunning apps/worker's token-refresh-daemon test (real PGlite, real Promise.all concurrency)...");
  const workerTests = runPnpm(["exec", "vitest", "run", "src/__tests__/token-refresh-daemon.test.ts"], workerDir);

  rows.push({
    check: "Connect and publish a test post on all three platforms",
    expected: "a live OAuth click-through against TikTok/Meta/Google, followed by a real publish",
    actual:
      "Connect: the OAuth authorization-url builders, code-exchange, and callback route are real and tested against local mock HTTP servers (tiktok.test.ts, meta.test.ts, youtube.test.ts) — a live click-through needs audited, funded app registrations this sandbox doesn't have. Publish: out of STEP 11's scope by design — the actual publish pipeline (preflight -> mediaStage -> platformInit -> upload -> poll -> confirm -> record) is STEP 12; STEP 11 only builds connect/health/quota/refresh.",
    pass: "DEFERRED",
  });
  rows.push({
    check: "Token refresh proven by fast-forwarding expiry",
    expected: "pass a `now` near a fixed `expiresAt` and observe a real refresh, with no wall-clock waiting",
    actual:
      coreTests.ok && workerTests.ok
        ? "token-refresh.test.ts: computeExpiryNotificationLevel/shouldAttemptRefresh proven against a parametrized T-7/T-3/T-1/expired threshold table. token-refresh-daemon.test.ts (real PGlite): a token seeded 2 days from a fixed `now` is genuinely refreshed via a mocked TikTok token endpoint, the new (rotated) refresh token is re-encrypted and persisted, and a T-1 notification fires for its new expiry — all driven by dependency-injected `now`, no real waiting."
        : "FAILED — see output above",
    pass: coreTests.ok && workerTests.ok ? "PASS" : "DEFERRED",
  });
  rows.push({
    check: "Quota counters correct under concurrent publishes",
    expected: "N concurrent requests against a cap never let more than the cap through, and the persisted count matches exactly",
    actual: coreTests.ok
      ? "quota.test.ts (real PGlite): 20 genuine concurrent Promise.all calls against a cap of 5 allow exactly 5, with the persisted platform_quota_state row read back and confirmed at exactly 5 — proven against a single atomic INSERT...ON CONFLICT...WHERE...RETURNING statement, not a read-then-write pattern that could race."
      : "FAILED",
    pass: coreTests.ok ? "PASS" : "DEFERRED",
  });
  rows.push({
    check: "A revoked token yields a clear reconnect prompt, not a silent failure",
    expected: "a failed refresh call surfaces as a distinct account state plus a real notification, never swallowed",
    actual: workerTests.ok
      ? "token-refresh-daemon.test.ts (real PGlite): a mocked 400 invalid_grant response from the refresh call is caught, the account's connection_status is set to reauth_required (never left connected on a silent catch), and an account_reauth_required notification fires with the real workspace/user resolved from a real membership row — not a fabricated id. apps/web/app/accounts/page.tsx surfaces reauth_required accounts with a distinct 'Reconnect needed' label and a Reconnect button that re-enters the same OAuth flow."
      : "FAILED",
    pass: workerTests.ok ? "PASS" : "DEFERRED",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 11 — Social Integrations");
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
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-11.md's honesty matrix before treating this as a pass."
      : "RESULT: no checks failed outright. See docs/steps/STEP-11.md for full scope decisions.",
  );
  process.exit(anyDeferred ? 1 : 0);
}

main();
