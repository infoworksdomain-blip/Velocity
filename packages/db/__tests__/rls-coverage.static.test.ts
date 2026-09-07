import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The static counterpart to tenant-isolation.generated.test.ts (GATE 2).
 * That test is a live-DB `itWithDb` test — genuinely stronger since it
 * proves the RLS policy actually blocks a cross-tenant read, but it never
 * runs in an environment with no reachable Postgres (this one, since
 * STEP 2). This test needs no DB at all: it proves the *mechanical*
 * precondition — that migration 0001's own warning ("this loop runs once,
 * now — a later migration that adds a NEW table with a workspace_id column
 * must include its own ENABLE/FORCE/POLICY statements") was actually
 * honoured by every migration written since, by parsing the migration SQL
 * files directly.
 *
 * Deliberately does not import the compiled schema — the migration files
 * are the actual thing that runs against a real database, and a Drizzle
 * schema column can drift from what a migration actually created if
 * someone hand-edits a .sql file. Checking the .sql files themselves is
 * checking the thing GATE 2/4 actually depend on.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

/**
 * Tables that legitimately have a workspace_id column but are deliberately
 * NOT RLS-protected, with the file:comment justifying each one. A table
 * must not be added here without also adding that justification in its
 * schema file — this list existing at all is the exception, not the norm.
 */
const DELIBERATE_NON_RLS_EXCEPTIONS = new Set([
  // schema/onboarding.ts: platform-root, fires before a workspace exists,
  // read pattern is platform-level funnel analysis, not tenant self-query.
  "onboarding_events",
]);

interface CreateTableInfo {
  name: string;
  hasWorkspaceIdColumn: boolean;
  migrationFile: string;
}

function extractCreateTables(sql: string, migrationFile: string): CreateTableInfo[] {
  const tables: CreateTableInfo[] = [];
  // Match `CREATE TABLE "name" ( ...body... );` blocks, non-greedy across newlines.
  const createTableRe = /CREATE TABLE\s+"(\w+)"\s*\(([\s\S]*?)\n\);/g;
  let match: RegExpExecArray | null;
  while ((match = createTableRe.exec(sql)) !== null) {
    const [, name, body] = match as unknown as [string, string, string];
    tables.push({
      name,
      hasWorkspaceIdColumn: /"workspace_id"/.test(body),
      migrationFile,
    });
  }
  return tables;
}

function extractRlsEnabledTables(sql: string): Set<string> {
  const enabled = new Set<string>();
  const re = /ALTER TABLE\s+"(\w+)"\s+ENABLE ROW LEVEL SECURITY/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sql)) !== null) {
    enabled.add(match[1]!);
  }
  return enabled;
}

function loadMigrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

describe("RLS coverage (static — the no-DB-needed counterpart to GATE 2's generated live test)", () => {
  it("every table created after 0001 with a workspace_id column has an explicit RLS enable statement in some migration", () => {
    const migrations = loadMigrationFiles();
    expect(migrations.length).toBeGreaterThan(1);

    // Tables created in 0000 are automatically covered by 0001's dynamic
    // introspection loop (it runs after 0000, before anything else) — that
    // mechanism doesn't need re-verifying here, only migrations after it do.
    const migration0000 = migrations.find((m) => m.name.startsWith("0000_"));
    expect(migration0000, "expected an 0000_*.up.sql migration to exist").toBeDefined();
    const tablesCoveredByInitialSweep = new Set(
      extractCreateTables(migration0000!.sql, migration0000!.name).map((t) => t.name),
    );

    const allRlsEnabledTables = new Set<string>();
    const tablesNeedingCoverage: CreateTableInfo[] = [];

    for (const migration of migrations) {
      for (const table of extractRlsEnabledTables(migration.sql)) {
        allRlsEnabledTables.add(table);
      }
      if (migration.name.startsWith("0000_")) continue; // already accounted for via the initial-sweep set
      for (const table of extractCreateTables(migration.sql, migration.name)) {
        if (table.hasWorkspaceIdColumn) tablesNeedingCoverage.push(table);
      }
    }

    expect(tablesNeedingCoverage.length).toBeGreaterThan(0); // sanity: this test should have real cases to check (0006, 0007 at minimum)

    const uncovered = tablesNeedingCoverage.filter(
      (t) =>
        !tablesCoveredByInitialSweep.has(t.name) &&
        !allRlsEnabledTables.has(t.name) &&
        !DELIBERATE_NON_RLS_EXCEPTIONS.has(t.name),
    );

    expect(
      uncovered,
      uncovered
        .map(
          (t) =>
            `"${t.name}" (created in ${t.migrationFile}) has a workspace_id column but no ENABLE ROW LEVEL SECURITY statement in any migration, and is not in DELIBERATE_NON_RLS_EXCEPTIONS`,
        )
        .join("\n"),
    ).toEqual([]);
  });

  it("every deliberate non-RLS exception genuinely has no ENABLE ROW LEVEL SECURITY statement (catches a stale exception entry)", () => {
    const migrations = loadMigrationFiles();
    const allRlsEnabledTables = new Set<string>();
    for (const migration of migrations) {
      for (const table of extractRlsEnabledTables(migration.sql)) {
        allRlsEnabledTables.add(table);
      }
    }
    for (const exception of DELIBERATE_NON_RLS_EXCEPTIONS) {
      expect(
        allRlsEnabledTables.has(exception),
        `"${exception}" is listed as a deliberate non-RLS exception but actually has an ENABLE ROW LEVEL SECURITY statement — remove it from DELIBERATE_NON_RLS_EXCEPTIONS`,
      ).toBe(false);
    }
  });
});
