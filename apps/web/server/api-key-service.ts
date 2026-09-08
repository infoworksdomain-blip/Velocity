import { createHash, randomBytes, randomUUID } from "node:crypto";
import { schema } from "@velocity/db";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getAdminDb } from "./db";

/**
 * Public API key custody (STEP 16, build script: "API-key auth scoped to
 * workspace + permission"). Same discipline as `platform_credentials`
 * (STEP 11) and webhook secrets — never stores the raw key, only a real
 * SHA-256 hash; the raw key is returned exactly once, at creation.
 */
export type ApiKeyDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

const KEY_PREFIX = "vk_live_";

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export interface CreateApiKeyInput {
  workspaceId: string;
  scopes: string[];
}

export interface CreateApiKeyResult {
  id: string;
  rawKey: string;
  keyPrefix: string;
}

export async function createApiKey(input: CreateApiKeyInput, db: ApiKeyDb = getAdminDb()): Promise<CreateApiKeyResult> {
  const id = randomUUID();
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 8);
  await db.insert(schema.apiKeys).values({ id, workspaceId: input.workspaceId, keyHash: hashKey(rawKey), keyPrefix, scopes: input.scopes });
  return { id, rawKey, keyPrefix };
}

export async function listApiKeys(workspaceId: string, db: ApiKeyDb = getAdminDb()) {
  const rows = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.workspaceId, workspaceId));
  return rows.map(({ keyHash: _keyHash, ...rest }) => rest); // never return the hash
}

export async function revokeApiKey(workspaceId: string, apiKeyId: string, db: ApiKeyDb = getAdminDb()): Promise<void> {
  const result = await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(and(eq(schema.apiKeys.id, apiKeyId), eq(schema.apiKeys.workspaceId, workspaceId))).returning({ id: schema.apiKeys.id });
  if (result.length === 0) throw new Error(`API key ${apiKeyId} not found in workspace ${workspaceId}`);
}

export interface VerifiedApiKey {
  id: string;
  workspaceId: string;
  scopes: string[];
}

/** Returns null for a missing, unknown, or revoked key — the caller turns that into a 401, never a distinguishable error (no oracle for "does this key exist"). */
export async function verifyApiKey(rawKey: string, db: ApiKeyDb = getAdminDb()): Promise<VerifiedApiKey | null> {
  const rows = await db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.keyHash, hashKey(rawKey)), isNull(schema.apiKeys.revokedAt))).limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.id));
  return { id: row.id, workspaceId: row.workspaceId, scopes: row.scopes as string[] };
}

export function hasScope(key: VerifiedApiKey, scope: string): boolean {
  return key.scopes.includes(scope) || key.scopes.includes("*");
}
