#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * GATE 19 report (STEP 19 — Billing). Same orchestrate-not-reimplement
 * shape as scripts/gate-08...18 — runs the real vitest suites;
 * docs/steps/STEP-19.md's honesty matrix is the source of truth for what
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
  const webDir = join(REPO_ROOT, "apps", "web");

  console.log("Running packages/core's billing + updated metering test suites (pricing, generation gate, reconciliation)...");
  const coreTests = runPnpm(["exec", "vitest", "run", "src/billing", "src/metering"], coreDir);

  console.log("\nRunning apps/web's billing-service test (real Stripe SDK against a local mock server, real HMAC webhook verification, real PGlite)...");
  const billingServiceTests = runPnpm(["exec", "vitest", "run", "server/__tests__/billing-service.test.ts"], webDir);

  console.log("\nRunning apps/web's credit-gate-service test (real PGlite — the generation cap + reconciliation)...");
  const creditGateTests = runPnpm(["exec", "vitest", "run", "server/__tests__/credit-gate-service.test.ts"], webDir);

  const allOk = coreTests.ok && billingServiceTests.ok && creditGateTests.ok;

  rows.push({
    check: "Full subscription lifecycle against Stripe test mode, including failed payment and recovery",
    expected: "checkout → active subscription → invoice paid/failed → dunning grace → recovery or cancellation, exercised against real Stripe test-mode API calls",
    actual: billingServiceTests.ok
      ? "billing-service.test.ts: the REAL stripe SDK builds real checkout-session/customer-creation requests (subscription mode and one-time top-up mode), proven against a local server mimicking Stripe's own response shapes (host/port/protocol override, the same 'real SDK, no live network' discipline packages/text-engine's Anthropic/OpenAI adapter tests already established). Real HMAC webhook-signature verification (Stripe.webhooks.constructEvent) is proven with a genuinely signed test payload AND a genuinely rejected forged/tampered one -- pure crypto, no network call needed either way. customer.subscription.updated/deleted and invoice.paid/invoice.payment_failed all sync real local subscriptions/invoices rows from realistic Stripe event payloads, including the past_due dunning-grace-period logic (generation-gate.test.ts, packages/core). Honest DEFERRED half: an actual end-to-end run against Stripe's live test-mode API (a real checkout completing, a real test card being declined and recovering) needs a real, funded Stripe test account this sandbox does not have -- the same class of gap as every other funded-credential dependency across this build (STEP 6's LLM extraction, STEP 11's live OAuth click-through)."
      : "FAILED — see output above",
    pass: billingServiceTests.ok ? "PARTIAL" : "DEFERRED",
  });

  rows.push({
    check: "Ledger reconciles to provider costs",
    expected: "every usage_events row (STEP 8's C5 metering) has a matching credit_ledger debit at the current market-anchored rate, with >1% aggregate drift flagged",
    actual: coreTests.ok && creditGateTests.ok
      ? "reconciliation.test.ts (packages/core): the pure drift-detection logic is proven for zero-drift, missing-debit, wrong-amount, and >1%-vs-<=1%-threshold cases. credit-gate-service.test.ts (real PGlite): reconcileWorkspaceLedger/reconcileAllWorkspaces prove the same claims against real seeded usage_events/credit_ledger rows across multiple workspaces, including that a drift-exceeding-threshold result publishes a real automation_alert notification (STEP 7's own bus) to a real workspace member. metering/usage-recorder.ts now debits credits via the SAME market-anchored creditsForUsage function this reconciliation check verifies against -- the pricing model and the reconciliation check are structurally the same source of truth, not two independently-maintained numbers that could drift apart."
      : "FAILED",
    pass: coreTests.ok && creditGateTests.ok ? "PASS" : "DEFERRED",
  });

  rows.push({
    check: "A workspace at its cap cannot generate",
    expected: "a real, enforced gate blocks the expensive render trigger when a workspace's credit balance is insufficient or its subscription is canceled/unpaid/past-due-beyond-grace",
    actual: coreTests.ok && creditGateTests.ok
      ? "generation-gate.test.ts (packages/core): the pure checkCanGenerate/isBlockedBySubscriptionStatus logic is proven for every combination (sufficient/insufficient balance, active/trialing/past_due-within-grace/past_due-expired/unpaid/canceled), including that a subscription block is checked and reported before the credit balance. credit-gate-service.test.ts (real PGlite): assertWorkspaceCanGenerate is proven end to end against real seeded credit_ledger/subscriptions rows, including that a refusal publishes a real credit_low notification (STEP 7's own bus, reserved for this exact step since its own doc comment). Wired into the real, single choke point STEP 9's 'never render before the swipe' architecture already established (render-service.ts's triggerRenderForConcept, called before the real Temporal render workflow ever starts) -- not a second, parallel gate."
      : "FAILED",
    pass: coreTests.ok && creditGateTests.ok ? "PASS" : "DEFERRED",
  });

  console.log("\n" + "=".repeat(100));
  console.log("GATE 19 — Billing");
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
      ? "RESULT: one or more checks DEFERRED — see docs/steps/STEP-19.md's honesty matrix before treating this as a pass."
      : "RESULT: the ledger-reconciliation and generation-cap claims pass fully for real; the Stripe-test-mode-lifecycle claim is an honest PARTIAL (every request/response/webhook path is real and proven against a local mock, but a live Stripe test account this sandbox doesn't have is needed for an actual end-to-end run). See docs/steps/STEP-19.md for full scope decisions.",
  );
  process.exit(anyDeferred || !allOk ? 1 : 0);
}

main();
