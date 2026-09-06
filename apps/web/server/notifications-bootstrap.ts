import { notifications as notificationsBus } from "@velocity/core";
import { schema } from "@velocity/db";
import { getAdminDb } from "./db";

/**
 * Wires the in-process notification bus (packages/core) to persistence, so
 * every published event becomes a row a user can see in the in-app center.
 * Idempotent module-level singleton, same lazy-on-first-use shape as
 * getAdminDb() — called once from notifications.ts's module scope, which
 * itself only loads once the tRPC router tree is built.
 */
let wired = false;

export function ensureNotificationPersistence(): void {
  if (wired) return;
  wired = true;

  notificationsBus.subscribeAll(async (event) => {
    await getAdminDb().insert(schema.notifications).values({
      workspaceId: event.workspaceId,
      userId: event.userId,
      type: event.type,
      title: event.title,
      body: event.body,
      data: event.data ?? null,
    });
  });
}
