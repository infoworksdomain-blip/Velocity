import { randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * `audit_logs` (STEP 3/STEP 1's governance schema) had exactly one writer
 * before this step (routers/auth.ts's impersonation flow), each doing its
 * own raw insert — no shared helper existed. STEP 14 needs one for real
 * (GATE 14: "every assistant tool call is audit-logged"), so this is the
 * first shared, reusable write path rather than a second copy-pasted
 * insert. Typed against the same generic `PgDatabase<any, typeof schema>`
 * base used throughout this codebase so it runs against PGlite in tests
 * and the real network Postgres in production unchanged.
 */
export type AuditDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface WriteAuditLogInput {
  /** null for a platform-level action with no owning workspace (e.g. superadmin impersonation) — see governance.ts's own schema comment. */
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAuditLog(db: AuditDb, input: WriteAuditLogInput): Promise<void> {
  await db.insert(schema.auditLogs).values({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
