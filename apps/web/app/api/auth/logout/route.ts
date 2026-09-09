import { appRouter } from "@/server/routers/_app";
import { clearSessionCookieHeader } from "@/server/auth-cookie";
import { createContext } from "@/server/context";

/** Same shape as ../login/route.ts — see that file's doc comment. Reuses the real session cookie to build an authenticated context, same as the tRPC route handler does. */
export async function POST(req: Request): Promise<Response> {
  const ctx = await createContext(req);
  if (!ctx.user) {
    return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": clearSessionCookieHeader() } });
  }

  const caller = appRouter.createCaller(ctx);
  await caller.auth.logout();
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": clearSessionCookieHeader() } });
}
