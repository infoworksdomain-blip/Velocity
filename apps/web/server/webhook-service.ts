import { randomBytes, randomUUID } from "node:crypto";
import { webhooks as webhooksCore } from "@velocity/core";
import { schema } from "@velocity/db";
import { and, desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";

export type WebhookDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CreateWebhookInput {
  workspaceId: string;
  url: string;
  events: webhooksCore.WebhookEventType[];
}

export interface CreateWebhookResult {
  id: string;
  secret: string;
}

/** The signing secret is returned exactly ONCE, at creation — the same custody discipline real webhook providers (and this codebase's own platform_credentials) use. It is never re-readable afterwards through this API. */
export async function createWebhook(input: CreateWebhookInput, db: WebhookDb = getAdminDb()): Promise<CreateWebhookResult> {
  const id = randomUUID();
  const secret = randomBytes(32).toString("hex");
  await db.insert(schema.webhooks).values({ id, workspaceId: input.workspaceId, url: input.url, secret, events: input.events, isActive: true });
  return { id, secret };
}

export async function listWebhooks(workspaceId: string, db: WebhookDb = getAdminDb()) {
  const rows = await db.select().from(schema.webhooks).where(eq(schema.webhooks.workspaceId, workspaceId));
  return rows.map(({ secret: _secret, ...rest }) => rest); // never return the secret after creation
}

export async function deleteWebhook(workspaceId: string, webhookId: string, db: WebhookDb = getAdminDb()): Promise<void> {
  const result = await db.delete(schema.webhooks).where(and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.workspaceId, workspaceId))).returning({ id: schema.webhooks.id });
  if (result.length === 0) throw new Error(`Webhook ${webhookId} not found in workspace ${workspaceId}`);
}

export async function listDeliveries(workspaceId: string, db: WebhookDb = getAdminDb()) {
  return db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.workspaceId, workspaceId)).orderBy(desc(schema.webhookDeliveries.createdAt)).limit(100);
}

export const replayDelivery = webhooksCore.replayWebhookDelivery;
export const emitEvent = webhooksCore.emitWebhookEvent;
