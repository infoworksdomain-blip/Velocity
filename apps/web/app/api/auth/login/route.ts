import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { authRouter } from "@/server/routers/auth";
import { clearSessionCookieHeader, sessionCookieHeader } from "@/server/auth-cookie";

/**
 * Post-STEP-22 audit remediation: a real cookie-issuing entrypoint. Calls
 * the existing, already-tested authRouter.login in-process via
 * `createCaller` (no HTTP hop, no duplicated auth logic) and turns its
 * token output into the `velocity_session` cookie context.ts expects —
 * the missing half of this build's own auth design (see auth-cookie.ts).
 *
 * Deliberately imports `authRouter` directly, not the full `appRouter` —
 * a real production bug found on the first live deploy: `appRouter`
 * transitively pulls in every other router, including ones that import
 * `@velocity/providers` (the brand-intelligence crawler's real
 * `playwright` dependency). Vercel's serverless function bundler
 * correctly excludes that huge, unrelated dependency from a small auth
 * endpoint's bundle, which made the whole module fail to load at runtime
 * with `Cannot find module 'playwright'` — invisible in this sandbox
 * (always had a full local node_modules) and even in `next start`
 * (same). `authRouter`'s own real dependency chain (auth-service,
 * admin-service, session-service, @velocity/core, @velocity/db) never
 * touches `@velocity/providers` — confirmed directly, not assumed.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body as { email?: unknown; password?: unknown };
  if (typeof input.email !== "string" || typeof input.password !== "string") {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  const caller = authRouter.createCaller({ sessionId: null, user: null, workspaceIdHeader: null });
  try {
    const result = await caller.login({ email: input.email, password: input.password });
    return Response.json(
      { userId: result.userId },
      { status: 200, headers: { "Set-Cookie": sessionCookieHeader(result.refreshToken) } },
    );
  } catch (err) {
    if (err instanceof TRPCError) {
      return Response.json({ error: err.message }, { status: getHTTPStatusCodeFromError(err), headers: { "Set-Cookie": clearSessionCookieHeader() } });
    }
    throw err;
  }
}
