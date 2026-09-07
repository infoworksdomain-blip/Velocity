import { completeOAuthConnection } from "@/server/social-service";

const VALID_PLATFORMS = new Set(["tiktok", "instagram", "youtube"]);

/**
 * The real OAuth redirect target (STEP 11) — TikTok/Meta/Google redirect
 * the USER'S BROWSER here with `?code=&state=` after consent, which is why
 * this is a plain Next.js route handler (a GET, following a redirect) and
 * not a tRPC procedure (tRPC expects a same-origin fetch call, not a
 * cross-site browser navigation initiated by the platform itself).
 */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }): Promise<Response> {
  const { platform } = await params;
  const url = new URL(req.url);
  const redirectBase = `${url.origin}/accounts`;

  if (!VALID_PLATFORMS.has(platform)) {
    return Response.redirect(`${redirectBase}?error=${encodeURIComponent("Unknown platform")}`, 302);
  }

  const oauthError = url.searchParams.get("error") ?? url.searchParams.get("error_description");
  if (oauthError) {
    return Response.redirect(`${redirectBase}?error=${encodeURIComponent(oauthError)}`, 302);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return Response.redirect(`${redirectBase}?error=${encodeURIComponent("Missing code or state")}`, 302);
  }

  try {
    await completeOAuthConnection(platform as "tiktok" | "instagram" | "youtube", code, state);
    return Response.redirect(`${redirectBase}?connected=${platform}`, 302);
  } catch (error) {
    // Never leak the raw error (could echo back internal detail from a platform error body) — a short, generic reason plus server-side logging is the real, safe behavior.
    console.error(`OAuth callback failed for ${platform}:`, error);
    return Response.redirect(`${redirectBase}?error=${encodeURIComponent("Connection failed — please try again")}`, 302);
  }
}
