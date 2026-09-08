import { sql } from "drizzle-orm";
import { apiErrorResponse, authenticateApiRequest, jsonResponse } from "@/server/api-v1-helpers";
import { getAdminDb } from "@/server/db";

/** `/v1/credits` — reads the real `credit_balances` materialized view (STEP 2), the same query dashboard.ts's internal procedure already uses. */
export async function GET(req: Request): Promise<Response> {
  try {
    const key = await authenticateApiRequest(req, "credits:read");
    const result = await getAdminDb().execute<{ balance: string }>(sql`SELECT balance FROM credit_balances WHERE workspace_id = ${key.workspaceId}`);
    const balance = result.rows[0]?.balance ?? "0";
    return jsonResponse({ balance: Number(balance) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
