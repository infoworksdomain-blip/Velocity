import { pgTable, text } from "drizzle-orm/pg-core";
import { idColumn, softDelete, timestamps, workspaceIdColumn } from "./_helpers";
import { platformEnum } from "./enums";
import { workspaces } from "./tenancy";

/**
 * A named public account STEP 14's Competitor Intelligence tracks
 * (build script: "track named competitor public accounts, extract
 * format/cadence/angle patterns — public data, blueprints only, C3").
 * `externalRef` is a real YouTube channel id for the platform this build
 * has a legitimate, documented, keyless-with-API-key public discovery
 * endpoint for (`channels.list`/`search.list`); for TikTok/Instagram —
 * platforms with no equivalent public third-party discovery API without
 * per-account OAuth consent — it's a free-text handle used only to label
 * blueprints ingested through the manual observed-post path (see
 * docs/steps/STEP-14.md's scope decision on why an automated scraper for
 * those two platforms isn't built here).
 */
export const competitors = pgTable("competitors", {
  id: idColumn(),
  workspaceId: workspaceIdColumn().references(() => workspaces.id),
  platform: platformEnum("platform").notNull(),
  externalRef: text("external_ref").notNull(),
  displayName: text("display_name").notNull(),
  ...timestamps(),
  ...softDelete(),
});
