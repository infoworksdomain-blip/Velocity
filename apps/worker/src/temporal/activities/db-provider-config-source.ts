import { createAdminDb, schema } from "@velocity/db";
import type { ProviderConfigSource } from "@velocity/providers";
import type { ProviderRegistryConfig } from "@velocity/contracts";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * Same generic `PgDatabase<any, typeof schema>` base used throughout this
 * codebase (e.g. packages/core/src/audit/index.ts's `AuditDb`) rather
 * than the NodePg-specific `Database` type, so this class runs unchanged
 * against a real network Postgres in production and a PGlite instance in
 * tests.
 */
export type AdminLikeDb = PgDatabase<any, typeof schema>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * STEP 18's DB-backed `ProviderConfigSource` -- the implementation
 * packages/providers/src/router/config-source.ts's own doc comment
 * reserved for this step ("a DB-backed source lands in STEP 18 alongside
 * the 60-second kill switch, behind this same interface, so nothing above
 * this layer needs to change when that happens"). Lives in apps/worker,
 * not packages/providers: packages/providers has no @velocity/db
 * dependency, and adding a DB-specific implementation there would break
 * its DI-seam layering -- the interface belongs in the package, the
 * concrete DB implementation is wired at the app boundary, the same split
 * this codebase already draws between `withWorkspace`/`getAdminDb()` (app
 * layer) and the services that only depend on a generic `Database` type.
 *
 * An override layer, not a full replacement: DB rows only override the
 * admin-controllable fields (enabled/weight/tiers/adapter/breaker) of a
 * provider the file source already defines. Credentials are never
 * duplicated into the DB -- `ai_provider_configs` has no credentials
 * column at all, so an admin console built on this table can never
 * expose or edit a raw API key -- and a provider with no matching DB row
 * keeps the file source's own values untouched, so an empty
 * `ai_provider_configs` table is exactly equivalent to the file source.
 */
export class DbProviderConfigSource implements ProviderConfigSource {
  constructor(
    private readonly fileSource: ProviderConfigSource,
    private readonly db: AdminLikeDb = createAdminDb(),
  ) {}

  async load(): Promise<ProviderRegistryConfig> {
    const fileConfig = await this.fileSource.load();
    const [overrideRows, settingsRows] = await Promise.all([
      this.db.select().from(schema.aiProviderConfigs),
      this.db.select().from(schema.aiRouterSettings).limit(1),
    ]);

    const overridesByKey = new Map(overrideRows.map((row) => [`${row.kind}:${row.providerId}`, row]));

    const providers = fileConfig.providers.map((entry) => {
      const override = overridesByKey.get(`${entry.kind}:${entry.id}`);
      if (!override) return entry;
      return {
        ...entry,
        enabled: override.enabled,
        weight: override.weight,
        tiers: override.tiers.length > 0 ? override.tiers : entry.tiers,
        adapter: override.adapter === "http" ? ("http" as const) : ("stub" as const),
        breaker: {
          failureThreshold: override.breakerFailureThreshold,
          windowSec: override.breakerWindowSec,
          cooldownSec: override.breakerCooldownSec,
        },
      };
    });

    const settings = settingsRows[0];
    return {
      ...fileConfig,
      providers,
      fallbackChainMaxLength: settings?.fallbackChainMaxLength ?? fileConfig.fallbackChainMaxLength,
      defaultCostCeilingUsd: settings
        ? {
            video: Number(settings.costCeilingVideoUsd),
            image: Number(settings.costCeilingImageUsd),
            tts: Number(settings.costCeilingTtsUsd),
            transcription: Number(settings.costCeilingTranscriptionUsd),
            text: Number(settings.costCeilingTextUsd),
          }
        : fileConfig.defaultCostCeilingUsd,
    };
  }
}
