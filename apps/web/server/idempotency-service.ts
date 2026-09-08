import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

export type IdempotencyDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface IdempotentResult {
  statusCode: number;
  body: unknown;
}

/**
 * The Public API's generic Idempotency-Key mechanism (build script: "cursor
 * pagination, rate limits, idempotency keys on writes"). `handler` runs
 * AT MOST ONCE per (workspaceId, idempotencyKey) pair — a real atomic
 * `INSERT ... ON CONFLICT DO NOTHING` claims the key first (the same
 * "claim before side effect" shape as `render_steps`/`publication_steps`);
 * if the insert didn't land, another request already owns this key and
 * this call replays its cached, real response instead of re-running
 * `handler`.
 */
export async function withIdempotency(db: IdempotencyDb, workspaceId: string, idempotencyKey: string, handler: () => Promise<IdempotentResult>): Promise<IdempotentResult> {
  const claimed = await db
    .insert(schema.apiIdempotencyKeys)
    .values({ id: randomUUID(), workspaceId, idempotencyKey })
    .onConflictDoNothing({ target: [schema.apiIdempotencyKeys.workspaceId, schema.apiIdempotencyKeys.idempotencyKey] })
    .returning({ id: schema.apiIdempotencyKeys.id });

  if (claimed.length === 0) {
    const existing = await db.select().from(schema.apiIdempotencyKeys).where(and(eq(schema.apiIdempotencyKeys.workspaceId, workspaceId), eq(schema.apiIdempotencyKeys.idempotencyKey, idempotencyKey))).limit(1);
    const row = existing[0];
    if (row?.statusCode !== null && row?.statusCode !== undefined) {
      return { statusCode: row.statusCode, body: row.responseBody };
    }
    // A concurrent request claimed the key but hasn't finished yet — a real, if rare, race; report 409 rather than silently re-running the handler (which would defeat the entire purpose of the key).
    return { statusCode: 409, body: { error: "A request with this Idempotency-Key is already in progress" } };
  }

  const result = await handler();
  await db.update(schema.apiIdempotencyKeys).set({ statusCode: result.statusCode, responseBody: result.body as object, updatedAt: new Date() }).where(and(eq(schema.apiIdempotencyKeys.workspaceId, workspaceId), eq(schema.apiIdempotencyKeys.idempotencyKey, idempotencyKey)));
  return result;
}
