import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * A generic, introspection-driven fixture builder — no per-table knowledge
 * is hand-maintained here. It discovers every table's columns, foreign
 * keys, and (for enum columns) valid labels from Postgres's own catalogs,
 * then inserts a minimal valid row.
 *
 * The one convention this relies on: every table's primary key column is
 * named "id" (uuid). That's true for all 49 tables in this schema by
 * construction (see packages/db/src/schema/_helpers.ts's idColumn()), so
 * it's a safe simplification rather than a full PK-constraint lookup.
 */

interface ColumnInfo {
  name: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  hasDefault: boolean;
}

interface ForeignKeyInfo {
  column: string;
  referencedTable: string;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function getColumns(pool: Pool, table: string): Promise<ColumnInfo[]> {
  const result = await pool.query<{
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, udt_name, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((r) => ({
    name: r.column_name,
    dataType: r.data_type,
    udtName: r.udt_name,
    isNullable: r.is_nullable === "YES",
    hasDefault: r.column_default !== null,
  }));
}

async function getForeignKeys(pool: Pool, table: string): Promise<ForeignKeyInfo[]> {
  const result = await pool.query<{ column_name: string; referenced_table: string }>(
    `SELECT kcu.column_name, ccu.table_name AS referenced_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = $1`,
    [table],
  );
  return result.rows.map((r) => ({ column: r.column_name, referencedTable: r.referenced_table }));
}

async function getEnumLabels(pool: Pool, enumTypeName: string): Promise<string[]> {
  const result = await pool.query<{ enumlabel: string }>(
    `SELECT e.enumlabel
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = $1
     ORDER BY e.enumsortorder`,
    [enumTypeName],
  );
  return result.rows.map((r) => r.enumlabel);
}

/** Every table in the public schema, ordered so a table always appears after everything it foreign-keys to. */
export async function topologicallySortAllTables(pool: Pool): Promise<string[]> {
  const tablesResult = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const allTables = tablesResult.rows.map((r) => r.tablename);

  const edgesResult = await pool.query<{ table_name: string; referenced_table: string }>(
    `SELECT tc.table_name, ccu.table_name AS referenced_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );

  const dependsOn = new Map<string, Set<string>>();
  for (const table of allTables) dependsOn.set(table, new Set());
  for (const row of edgesResult.rows) {
    if (row.table_name === row.referenced_table) continue; // no self-referencing FKs in this schema
    dependsOn.get(row.table_name)?.add(row.referenced_table);
  }

  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(table: string): void {
    if (visited.has(table)) return;
    if (visiting.has(table)) {
      throw new Error(`Fixture builder: circular foreign-key dependency detected at "${table}"`);
    }
    visiting.add(table);
    for (const dep of dependsOn.get(table) ?? []) visit(dep);
    visiting.delete(table);
    visited.add(table);
    sorted.push(table);
  }

  for (const table of allTables) visit(table);
  return sorted;
}

/** Every table with a workspace_id column — the same discovery query migration 0001 uses for RLS setup. */
export async function getTenantTables(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ relname: string }>(
    `SELECT DISTINCT c.relname
     FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'workspace_id' AND NOT a.attisdropped`,
  );
  return result.rows.map((r) => r.relname);
}

function synthesizeValue(dataType: string): unknown {
  switch (dataType) {
    case "uuid":
      return randomUUID();
    case "text":
    case "character varying":
      return "fixture";
    case "integer":
    case "bigint":
    case "smallint":
      return 1;
    case "numeric":
    case "real":
    case "double precision":
      return "1";
    case "boolean":
      return true;
    case "timestamp with time zone":
    case "timestamp without time zone":
    case "date":
      return new Date().toISOString();
    case "jsonb":
    case "json":
      return JSON.stringify({});
    default:
      throw new Error(
        `Fixture builder: no synthetic value strategy for Postgres type "${dataType}" — extend synthesizeValue`,
      );
  }
}

/**
 * Inserts a minimal valid row into `table` and returns its id.
 *
 * `workspaceId` is written into the table's own `workspace_id` column if it
 * has one (null/omitted for platform-root tables that lack the column —
 * the column-presence check makes passing null here harmless either way).
 * `resolved` maps referencedTable -> already-created row id, used to fill
 * any NOT NULL foreign key column that lacks a default.
 */
export async function insertMinimalRow(
  pool: Pool,
  table: string,
  workspaceId: string | null,
  resolved: Map<string, string>,
): Promise<string> {
  const id = randomUUID();
  const columns = await getColumns(pool, table);
  const fks = await getForeignKeys(pool, table);
  const fkByColumn = new Map(fks.map((fk) => [fk.column, fk]));

  const values: Record<string, unknown> = { id };
  for (const col of columns) {
    if (col.name === "id") continue;
    if (col.name === "workspace_id") {
      values[col.name] = workspaceId;
      continue;
    }
    if (col.isNullable) continue;
    if (col.hasDefault) continue;

    const fk = fkByColumn.get(col.name);
    if (fk) {
      const refId = resolved.get(fk.referencedTable);
      if (!refId) {
        throw new Error(
          `Fixture builder: no resolved row for ${table}.${col.name} -> ${fk.referencedTable}. ` +
            "Check that topologicallySortAllTables ran before this insert.",
        );
      }
      values[col.name] = refId;
      continue;
    }

    if (col.dataType === "USER-DEFINED") {
      const labels = await getEnumLabels(pool, col.udtName);
      if (labels.length === 0) {
        throw new Error(`Fixture builder: enum type "${col.udtName}" has no labels`);
      }
      values[col.name] = labels[0];
      continue;
    }

    values[col.name] = synthesizeValue(col.dataType);
  }

  const columnNames = Object.keys(values);
  const placeholders = columnNames.map((_, i) => `$${i + 1}`);
  await pool.query(
    `INSERT INTO ${quoteIdent(table)} (${columnNames.map(quoteIdent).join(", ")}) VALUES (${placeholders.join(", ")})`,
    columnNames.map((name) => values[name]),
  );
  return id;
}

export interface TwoWorkspaceFixture {
  tenantTables: string[];
  workspaceIdA: string;
  workspaceIdB: string;
  rowsA: Map<string, string>;
  rowsB: Map<string, string>;
}

/**
 * Builds two fully independent tenants (each with one row in every tenant
 * table, correctly chained through their own FK graph) so the isolation
 * test can prove cross-tenant reads return nothing, table by table.
 */
export async function buildTwoWorkspaceFixture(pool: Pool): Promise<TwoWorkspaceFixture> {
  const allTables = await topologicallySortAllTables(pool);
  const tenantTables = new Set(await getTenantTables(pool));

  const shared = new Map<string, string>();
  const perSide: Record<"A" | "B", Map<string, string>> = { A: new Map(), B: new Map() };

  for (const table of allTables) {
    if (table === "workspaces") {
      for (const side of ["A", "B"] as const) {
        const id = await insertMinimalRow(pool, table, null, shared);
        perSide[side].set(table, id);
      }
      continue;
    }
    if (tenantTables.has(table)) {
      for (const side of ["A", "B"] as const) {
        const combined = new Map([...shared, ...perSide[side]]);
        const workspaceId = perSide[side].get("workspaces");
        if (!workspaceId) throw new Error('Fixture builder: "workspaces" must sort before its dependents');
        const id = await insertMinimalRow(pool, table, workspaceId, combined);
        perSide[side].set(table, id);
      }
      continue;
    }
    const id = await insertMinimalRow(pool, table, null, shared);
    shared.set(table, id);
  }

  return {
    tenantTables: [...tenantTables],
    workspaceIdA: perSide.A.get("workspaces")!,
    workspaceIdB: perSide.B.get("workspaces")!,
    rowsA: perSide.A,
    rowsB: perSide.B,
  };
}

/** Queries, as the app role scoped to `workspaceId`, which of `candidateIds` are visible in `table`. */
export async function queryVisibleIds(
  appPool: Pool,
  workspaceId: string | null,
  table: string,
  candidateIds: string[],
): Promise<string[]> {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    if (workspaceId) {
      await client.query("SELECT set_config('app.workspace_id', $1, true)", [workspaceId]);
    }
    const result = await client.query<{ id: string }>(
      `SELECT id FROM ${quoteIdent(table)} WHERE id = ANY($1::uuid[])`,
      [candidateIds],
    );
    await client.query("COMMIT");
    return result.rows.map((r) => r.id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
