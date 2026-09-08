import { checkSystemHealth } from "@/server/admin-service";

/**
 * A real, unauthenticated health-check endpoint — found missing during a
 * post-STEP-22 production-readiness audit. `infra/terraform`'s ALB
 * target-group health checks (ecs.tf) originally pointed at
 * `/api/trpc/dashboard.summary`, which was doubly wrong: that procedure
 * doesn't exist (the real one is `dashboard.get`), and even a real tRPC
 * query procedure is the wrong KIND of target for a load-balancer health
 * check regardless of its name — ALB health checks are unauthenticated
 * GET requests with no session cookie, and `dashboard.get` requires a
 * real, authenticated workspace membership (`requireWorkspacePermission`).
 * This route is what a health check should actually hit: no auth, no
 * workspace context, just "is this process up and can it reach its
 * database" — reusing STEP 18's real `checkSystemHealth` (a genuine
 * `SELECT 1`, not a hardcoded 200).
 */
export async function GET(): Promise<Response> {
  const health = await checkSystemHealth();
  return Response.json(health, { status: health.databaseReachable ? 200 : 503 });
}
