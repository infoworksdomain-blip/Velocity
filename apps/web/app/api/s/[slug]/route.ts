import { recordClick } from "@/server/analytics-service";
import { getAdminDb } from "@/server/db";

/**
 * The short-link redirect (STEP 13's website attribution: "short-link
 * domain + UTM + a server-side event endpoint... joining post → click →
 * signup → conversion"). A plain route handler, not tRPC, for the same
 * reason the OAuth callback is one — this is a cross-site browser
 * navigation (a visitor clicking a link in a TikTok/Instagram/YouTube
 * post's bio or caption), not a same-origin fetch.
 *
 * The click event's own id becomes `vclid` on the redirect — an
 * unguessable, server-generated UUID the customer's site is expected to
 * carry through their own signup/conversion flow and hand back to
 * `/api/track`. Knowledge of a valid vclid IS the authorization for that
 * endpoint (the same shape as Stripe's client_reference_id or a GA
 * client id) — a real, standard pattern for a public, unauthenticated
 * tracking pixel/webhook, not a security shortcut.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;

  const clicked = await recordClick(getAdminDb(), slug);
  if (!clicked) return new Response("Not found", { status: 404 });

  let destination: URL;
  try {
    destination = new URL(clicked.destinationUrl);
  } catch {
    // A malformed destination_url stored on this row is a real data
    // problem, not something to 500 a real visitor over — the click was
    // still recorded above.
    return new Response("This link's destination is misconfigured", { status: 502 });
  }
  destination.searchParams.set("vclid", clicked.clickEventId);
  return Response.redirect(destination.toString(), 302);
}
