import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";

/**
 * STEP 18 — AI model management (build script: "enable/disable providers,
 * routing weights, cost ceilings, per-model kill switch — you will need
 * this the next time a vendor deprecates at three weeks' notice"). This
 * is the DB-backed `ProviderConfigSource` implementation STEP 8's own
 * `config-source.ts` doc comment explicitly reserved this step for
 * ("a DB-backed source lands in STEP 18 alongside the 60-second kill
 * switch, behind this same interface, so nothing above this layer needs
 * to change when that happens"). Platform-root, like `partners`/
 * `creators` — a provider entry isn't owned by any workspace.
 */
export const aiProviderConfigs = pgTable(
  "ai_provider_configs",
  {
    id: idColumn(),
    kind: text("kind").notNull(), // video | image | tts | transcription | text
    providerId: text("provider_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    weight: integer("weight").notNull().default(50),
    tiers: jsonb("tiers").$type<string[]>().notNull().default([]),
    adapter: text("adapter").notNull().default("stub"),
    breakerFailureThreshold: integer("breaker_failure_threshold").notNull().default(5),
    breakerWindowSec: integer("breaker_window_sec").notNull().default(60),
    breakerCooldownSec: integer("breaker_cooldown_sec").notNull().default(120),
    ...timestamps(),
  },
  (table) => [uniqueIndex("ai_provider_configs_kind_provider_idx").on(table.kind, table.providerId)],
);

/** A real singleton row (there is always exactly one) — the router-wide settings that aren't per-provider: fallback chain depth and the default cost ceiling per job kind. */
export const aiRouterSettings = pgTable("ai_router_settings", {
  id: idColumn(),
  fallbackChainMaxLength: integer("fallback_chain_max_length").notNull().default(3),
  costCeilingVideoUsd: numeric("cost_ceiling_video_usd", { precision: 10, scale: 4 }).notNull(),
  costCeilingImageUsd: numeric("cost_ceiling_image_usd", { precision: 10, scale: 4 }).notNull(),
  costCeilingTtsUsd: numeric("cost_ceiling_tts_usd", { precision: 10, scale: 4 }).notNull(),
  costCeilingTranscriptionUsd: numeric("cost_ceiling_transcription_usd", { precision: 10, scale: 4 }).notNull(),
  costCeilingTextUsd: numeric("cost_ceiling_text_usd", { precision: 10, scale: 4 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
