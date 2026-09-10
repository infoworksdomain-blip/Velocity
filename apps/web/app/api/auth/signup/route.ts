import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { authRouter } from "@/server/routers/auth";
import { sessionCookieHeader } from "@/server/auth-cookie";

/** Same shape as ../login/route.ts — see that file's doc comment (including why this imports `authRouter` directly, not `appRouter`). */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body as { email?: unknown; password?: unknown; name?: unknown };
  if (typeof input.email !== "string" || typeof input.password !== "string") {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  const caller = authRouter.createCaller({ sessionId: null, user: null, workspaceIdHeader: null });
  try {
    const result = await caller.signup({
      email: input.email,
      password: input.password,
      name: typeof input.name === "string" ? input.name : undefined,
    });
    return Response.json(
      { userId: result.userId },
      { status: 201, headers: { "Set-Cookie": sessionCookieHeader(result.refreshToken) } },
    );
  } catch (err) {
    if (err instanceof TRPCError) {
      return Response.json({ error: err.message }, { status: getHTTPStatusCodeFromError(err) });
    }
    throw err;
  }
}
