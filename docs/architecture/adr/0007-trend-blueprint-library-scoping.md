# ADR 0007 — Trend blueprints live in a platform-root library, not per-workspace

## Status
Accepted

## Context

STEP 8.3 requires ingesting trending signals per niche and extracting structure (`{hook_pattern, beat_timings, shot_grammar, caption_cadence, text_placement, audio_archetype, niche_tags, velocity_score}`), retrieved later by vector similarity against a brand/angle embedding. The original `trend_blueprints` table (STEP 2) is workspace-scoped, with RLS, like every other tenant table.

But "ingest trending signals per niche" is not a per-tenant activity — a "productivity software" trend blueprint extracted from public signals is equally relevant to every workspace in that niche, not specific to the one that happened to trigger the ingestion. Writing one blueprint row per workspace per niche either duplicates the corpus N times (one copy per workspace that happens to be in a niche) or makes ingestion itself O(workspaces) — running the same extraction once per tenant for content that isn't tenant-specific in the first place.

This is a direct tension with C4 ("tenant isolation by default... tested adversarially") and ADR 0003's general rule that isolation starts at every tenant table. The question this ADR answers: is it ever correct for a table to *not* be workspace-scoped, and if so, on what basis.

## Decision

Split into two tables:

- **`trend_blueprint_library`** (new, platform-root, no `workspace_id`, no RLS): the actual corpus, written once per real blueprint by the ingestion process (an admin-role write path, not a tenant request). It carries no tenant data — only structure extracted from public trend signals, and per C3 never a dereferenceable media reference (`packages/contracts/src/trends.ts`'s `TrendSignal` type has no URL field at all, so this is a compile-time guarantee, not a review checklist item).
- **`trend_blueprints`** (existing, workspace-scoped, RLS unchanged): now the per-workspace *adopted* copy, written lazily the first time a workspace's retrieval query actually matches a library entry, carrying a `library_id` back-reference for lineage. This preserves the existing shape everything else (STEP 8.2's concept generation, STEP 9's Velocity) already expects — a workspace's own row it can attach `blueprint_id` foreign keys to — without forcing ingestion to fan out per tenant.

The app role gets `GRANT SELECT` only on `trend_blueprint_library` — every workspace's retrieval query can read the shared corpus, but nothing about a tenant request can write to it. Ingestion always goes through the admin connection.

This is not an exception to C4: C4 protects *tenant data* from cross-tenant leakage. The library holds no tenant data — it's closer in shape to `fonts` (STEP 2's other platform-root, admin-write, universally-readable table) than to any tenant table. Retrieval unions `trend_blueprint_library` and each workspace's own `trend_blueprints` rather than querying only one, so a workspace sees both the shared corpus and anything it has locally overridden or extended.

## Consequences

- Ingestion runs once per blueprint, not once per workspace — the actual cost driver (an LLM extraction call per signal, metered under C5) scales with the number of *signals*, not with `signals × workspaces`.
- A new engineer reading `packages/db/src/schema/content-planning.ts` needs this ADR to understand why one trends-shaped table has RLS and a sibling one deliberately doesn't — flagged in both the schema file's own comment and here.
- If a workspace ever needs a genuinely private, never-shared blueprint (a competitor's exact structure a customer paid to have kept exclusive, say), that's a real product requirement STEP 9+ would need to design for explicitly — not something this split accidentally forecloses, since `trend_blueprints` rows with no `library_id` are already fully expressible as workspace-private today.
