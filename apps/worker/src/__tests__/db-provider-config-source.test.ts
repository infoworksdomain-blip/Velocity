import { fileURLToPath } from "node:url";
import { schema } from "@velocity/db";
import { createPgliteTestDb, type PgliteTestDb } from "@velocity/db/dist/testing/pglite.js";
import { FileProviderConfigSource, type ProviderConfigSource } from "@velocity/providers";
import type { ProviderEntry, ProviderRegistryConfig } from "@velocity/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbProviderConfigSource } from "../temporal/activities/db-provider-config-source.js";

const REAL_PROVIDERS_CONFIG_PATH = fileURLToPath(new URL("../../../../config/providers.json", import.meta.url));

function fileEntry(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    kind: "video",
    id: "test-provider-not-seeded",
    enabled: true,
    weight: 100,
    tiers: ["free", "starter", "growth", "pro"],
    adapter: "stub",
    credentials: { apiKey: "file-secret-should-never-be-overridden" },
    breaker: { failureThreshold: 5, windowSec: 60, cooldownSec: 120 },
    ...overrides,
  };
}

function fixtureFileConfig(providers: ProviderEntry[]): ProviderRegistryConfig {
  return {
    version: 1,
    providers,
    fallbackChainMaxLength: 3,
    defaultCostCeilingUsd: { video: 0.6, image: 0.05, tts: 0.02, transcription: 0.01, text: 0.02 },
  };
}

class StaticFileSource implements ProviderConfigSource {
  constructor(private readonly config: ProviderRegistryConfig) {}
  async load(): Promise<ProviderRegistryConfig> {
    return this.config;
  }
}

/**
 * Real PGlite (embedded Postgres) coverage for STEP 18's DB-backed
 * ProviderConfigSource — proving the override-layer contract end to end
 * against real INSERTed rows, not a mocked query builder. One shared
 * PGlite instance across this describe block (real Postgres replay is
 * ~10s to boot) — tests either use provider ids the real migration 0022
 * seed never touches (`test-provider-not-seeded`), or explicitly assert
 * against the seed's own real values, so ordering between tests in this
 * file never matters.
 */
describe("DbProviderConfigSource — DB overlay on top of the file source (real PGlite)", () => {
  let testDb: PgliteTestDb;

  beforeAll(async () => {
    testDb = await createPgliteTestDb();
  }, 60000);

  afterAll(async () => {
    await testDb.close();
  });

  it("migration 0022's seed rows exactly reproduce the real config/providers.json file (no silent behaviour change)", async () => {
    const fileSource = new FileProviderConfigSource(REAL_PROVIDERS_CONFIG_PATH);
    const fileConfig = await fileSource.load();
    const source = new DbProviderConfigSource(fileSource, testDb.admin);
    const loaded = await source.load();
    expect(loaded).toEqual(fileConfig);
  });

  it("a DB row overrides enabled/weight/adapter/breaker but never the file's credentials", async () => {
    await testDb.admin.insert(schema.aiProviderConfigs).values({
      kind: "video",
      providerId: "test-provider-not-seeded",
      enabled: false,
      weight: 12,
      tiers: ["pro"],
      adapter: "http",
      breakerFailureThreshold: 9,
      breakerWindowSec: 30,
      breakerCooldownSec: 300,
    });

    const fileConfig = fixtureFileConfig([fileEntry()]);
    const source = new DbProviderConfigSource(new StaticFileSource(fileConfig), testDb.admin);
    const loaded = await source.load();

    const overridden = loaded.providers.find((p) => p.id === "test-provider-not-seeded");
    expect(overridden).toBeDefined();
    expect(overridden?.enabled).toBe(false);
    expect(overridden?.weight).toBe(12);
    expect(overridden?.tiers).toEqual(["pro"]);
    expect(overridden?.adapter).toBe("http");
    expect(overridden?.breaker).toEqual({ failureThreshold: 9, windowSec: 30, cooldownSec: 300 });
    // Credentials are never stored in ai_provider_configs — always the file's own value.
    expect(overridden?.credentials).toEqual({ apiKey: "file-secret-should-never-be-overridden" });
  });

  it("a provider with no matching DB row keeps the file source's values untouched", async () => {
    const fileConfig = fixtureFileConfig([fileEntry({ id: "another-not-seeded-provider", weight: 77 })]);
    const source = new DbProviderConfigSource(new StaticFileSource(fileConfig), testDb.admin);
    const loaded = await source.load();
    expect(loaded.providers.find((p) => p.id === "another-not-seeded-provider")?.weight).toBe(77);
  });

  it("ai_router_settings overrides fallbackChainMaxLength and every cost ceiling once its singleton row is updated", async () => {
    // Migration 0022 already seeds exactly one row (fallbackChainMaxLength
    // 3, matching config/providers.json) — update it, the way a real admin
    // console would, rather than inserting a second row into what's meant
    // to be a singleton table.
    const [existing] = await testDb.admin.select({ id: schema.aiRouterSettings.id }).from(schema.aiRouterSettings).limit(1);
    expect(existing).toBeDefined();
    await testDb.admin
      .update(schema.aiRouterSettings)
      .set({
        fallbackChainMaxLength: 5,
        costCeilingVideoUsd: "1.2000",
        costCeilingImageUsd: "0.1000",
        costCeilingTtsUsd: "0.0400",
        costCeilingTranscriptionUsd: "0.0200",
        costCeilingTextUsd: "0.0500",
      })
      .where(eq(schema.aiRouterSettings.id, existing!.id));

    const fileConfig = fixtureFileConfig([fileEntry({ id: "yet-another-not-seeded-provider" })]);
    const source = new DbProviderConfigSource(new StaticFileSource(fileConfig), testDb.admin);
    const loaded = await source.load();

    expect(loaded.fallbackChainMaxLength).toBe(5);
    expect(loaded.defaultCostCeilingUsd).toEqual({ video: 1.2, image: 0.1, tts: 0.04, transcription: 0.02, text: 0.05 });
  });
});
