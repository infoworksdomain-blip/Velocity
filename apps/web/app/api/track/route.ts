import { recordAttributionEvent } from "@/server/analytics-service";
import { getAdminDb } from "@/server/db";

const VALID_EVENT_TYPES = new Set(["signup", "conversion"]);

interface TrackRequestBody {
  vclid?: unknown;
  eventType?: unknown;
  externalRef?: unknown;
}

/**
 * The server-side event endpoint the customer installs (STEP 13:
 * "a server-side event endpoint the customer installs, joining post →
 * click → signup → conversion"). A plain route handler — the customer's
 * OWN backend calls this server-to-server when their user signs up or
 * converts, not a browser fetch, so tRPC's session-cookie auth model
 * doesn't apply here at all; see app/api/s/[slug]/route.ts's own doc
 * comment for why `vclid` itself is the real authorization.
 */
export async function POST(req: Request): Promise<Response> {
  let body: TrackRequestBody;
  try {
    body = (await req.json()) as TrackRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.vclid !== "string" || typeof body.eventType !== "string" || !VALID_EVENT_TYPES.has(body.eventType)) {
    return Response.json({ error: "Expected { vclid: string, eventType: 'signup' | 'conversion', externalRef?: string }" }, { status: 400 });
  }
  const externalRef = typeof body.externalRef === "string" ? body.externalRef : null;

  const recorded = await recordAttributionEvent(getAdminDb(), body.vclid, body.eventType as "signup" | "conversion", externalRef);
  if (!recorded) return Response.json({ error: "Unknown vclid" }, { status: 404 });

  return Response.json({ ok: true });
}
