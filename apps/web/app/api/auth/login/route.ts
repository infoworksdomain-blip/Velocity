import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { appRouter } from "@/server/routers/_app";
import { clearSessionCookieHeader, sessionCookieHeader } from "@/server/auth-cookie";

/**
 * Post-STEP-22 audit remediation: a real cookie-issuing entrypoint. Calls
 * the existing, already-tested authRouter.login in-process via
 * `createCaller` (no HTTP hop, no duplicated auth logic) and turns its
 * token output into the `velocity_session` cookie context.ts expects —
 * the missing half of this build's own auth design (see auth-cookie.ts).
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

  const caller = appRouter.createCaller({ sessionId: null, user: null, workspaceIdHeader: null });
  try {
    const result = await caller.auth.login({ email: input.email, password: input.password });
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
