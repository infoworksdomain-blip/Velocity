import { webhooks as webhooksCore } from "@velocity/core";
import { z } from "zod";
import { apiErrorResponse, authenticateApiRequest, jsonResponse } from "@/server/api-v1-helpers";
import { getAdminDb } from "@/server/db";
import { createWebhook, listWebhooks } from "@/server/webhook-service";
import { withIdempotency } from "@/server/idempotency-service";

const CreateWebhookBodySchema = z.object({ url: z.string().url(), events: z.array(z.enum(webhooksCore.WEBHOOK_EVENT_TYPES)).min(1) });

export async function GET(req: Request): Promise<Response> {
  try {
    const key = await authenticateApiRequest(req, "webhooks:read");
    const rows = await listWebhooks(key.workspaceId, getAdminDb());
    return jsonResponse({ data: rows });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const key = await authenticateApiRequest(req, "webhooks:write");
    const idempotencyKey = req.headers.get("idempotency-key");
    if (!idempotencyKey) return apiErrorResponse(new Error("Idempotency-Key header is required for this write"));

    const body = CreateWebhookBodySchema.parse(await req.json());
    const db = getAdminDb();
    const result = await withIdempotency(db, key.workspaceId, idempotencyKey, async () => {
      const created = await createWebhook({ workspaceId: key.workspaceId, ...body }, db);
      return { statusCode: 201, body: created };
    });

    return jsonResponse(result.body, result.statusCode);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
