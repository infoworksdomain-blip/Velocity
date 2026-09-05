import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Shared column builders so every tenant table gets the same shape without
 * copy-pasted drift. `idColumn`/`workspaceIdColumn`/`timestamps` are plain
 * functions (not shared instances) so every call site gets a fresh column
 * builder, which Drizzle requires.
 */

export const idColumn = () => uuid("id").primaryKey().defaultRandom();

export const workspaceIdColumn = () => uuid("workspace_id").notNull();

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const softDelete = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * pgvector column. Drizzle 0.38 has no native `vector` column type, so this
 * is a customType against the `vector` extension (created in migration
 * 0000, before any table using this type is created). Values round-trip as
 * plain number[] arrays; the wire format matches pgvector's text I/O.
 */
export const vector = customType<{
  data: number[];
  config: { dimensions: number };
  configRequired: true;
}>({
  dataType(config) {
    return `vector(${config.dimensions})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    const raw = value as unknown as string;
    return raw
      .slice(1, -1)
      .split(",")
      .filter((v) => v.length > 0)
      .map(Number);
  },
});

/** Standard embedding width used across brand_profiles, trend_blueprints, content_concepts, hook_variants. */
export const EMBEDDING_DIMENSIONS = 1536;
