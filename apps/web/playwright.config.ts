import { defineConfig, devices } from "@playwright/test";

/**
 * Post-STEP-22 audit remediation: a real Playwright config, per this
 * user's own web-testing convention of covering "minimum Chrome, Firefox,
 * Safari." `webServer` boots a real `next dev` (confirmed to start
 * cleanly with no DATABASE_URL/AUTH_SECRET/etc. configured — every
 * env-dependent connection in this codebase is lazy, on first real use,
 * not at module load) so these specs exercise the real Next.js server,
 * not a mock.
 *
 * Scope, stated honestly: specs here cover what's genuinely testable
 * without a live, reachable Postgres — page rendering, client-side
 * navigation, and form/validation behavior. Full authenticated flows
 * (submit signup -> real session -> dashboard data) need a real database
 * this sandbox doesn't have (see docs/audit/REMEDIATION.md's Unit 5 for
 * why @electric-sql/pglite-socket was investigated and rejected as a
 * substitute: no role/auth support, so `velocity_app`'s RLS-critical role
 * binding — this build's own C4 tenant-isolation invariant — can't be
 * faithfully exercised through it).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    // A real run against `pnpm dev` found genuine flakiness (page.goto
    // timeouts, an aborted navigation) traced to Next dev's on-demand
    // per-route compilation getting overwhelmed by 3 browser projects
    // hitting the same server in parallel — a real production build
    // avoids that entirely and is what these tests should exercise
    // anyway. Long timeout: measured at ~2.5 minutes for a real cold
    // `next build` + `next start` in this sandbox; 300s leaves real margin
    // rather than tuning to the observed edge.
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
  },
});
