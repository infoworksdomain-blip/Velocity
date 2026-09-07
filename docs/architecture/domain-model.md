# Domain Model

The fixed vocabulary for VELOCITY. Every later step — the STEP 2 schema, the STEP 8/8B pipeline, the STEP 16 public API — reuses these exact names. No renaming after STEP 1 without a follow-up ADR.

For each entity: what it represents, its lifecycle (if it has one), what it belongs to / references, and which constraint from C1–C8 applies to it directly.

### Organisation
The billing and identity root. Owns one or more `Workspace` records and, on higher tiers, an Agency console (STEP 17). Has no lifecycle states of its own beyond active/suspended (STEP 18 fraud/risk). No direct constraint, but `credit_ledger` and `subscriptions` (STEP 19) hang off it.

### Workspace
A tenant-scoped operating unit — one brand, one calendar, one credit balance. Every other tenant-scoped entity below carries a `workspace_id` and is subject to **C4** (RLS on every tenant table). Has a `workspace_type` (`individual` | `business`) that drives onboarding branch and default automations (§3 of the build script). Belongs to an `Organisation`.

### BrandProfile
Versioned extraction of a workspace's brand: product, ICP, pains, benefits, tone, visual identity, competitors, compliance notes (STEP 6). Multiple versions per workspace, diffable. The extractor treats scraped source content as untrusted — this is the entity most directly exposed to prompt-injection risk (see threat model). Embedded into pgvector for retrieval by `Angle`/`TrendBlueprint` matching.

### Angle
A marketing angle derived from a `BrandProfile` (pain-led, transformation, comparison, myth-bust, POV, listicle, founder story, social proof, objection-handling, meme — STEP 8.2). Feeds `ContentConcept` generation and is a dimension in the Velocity bandit (STEP 9).

### TrendBlueprint
The **structure** of a trending video — hook pattern, beat timings, shot grammar, caption cadence, text placement, audio archetype (STEP 8.3). Deliberately holds no source footage — this is the entity **C3** exists to constrain. Retrieved by vector similarity against the brand/angle embedding.

### Persona
An AI UGC character or AI Influencer identity — appearance, voice, tone, backstory (STEP 15). Any persona modeling a real identifiable person requires a recorded consent artefact before generation is permitted; this is enforced at the `Persona` level, not downstream.

### ContentConcept
The Tier-1, LLM-only unit that fills the Velocity queue: a hook, an `Angle`, a format, a `Persona`, a `TrendBlueprint`, a storyboard, a link to its `TextPlan`, and a preview asset (STEP 8.2, STEP 9). Always carries `ai_generated: true`. Cheap to produce in bulk — this is the entity the two-tier queue economics (§4 of the Fastlane teardown, STEP 9 of the build script) depend on staying cheap.

### TextPlan
The on-screen text contract: hook, 5–8 hook variants, timed overlays, caption track, CTA, per-slide text — one JSON object produced by the text-engine (Anthropic or OpenAI) and consumed by Remotion (STEP 8B.2). Versioned independently of the video track so a hook swap re-renders in seconds, not minutes. Every generation call that produces one is a **C5** metering event.

### ContentItem
The Tier-2 unit: a `ContentConcept` that has been approved (swiped right) and is progressing toward a real render. Carries the bound `TextPlan`, the render lineage, and the `ai_generated` provenance flag (**C2**).

### Render
One actual video/image composition job and its output — the Temporal workflow's unit of work (STEP 8.4). Carries the C2PA manifest, preserved model watermark, model + prompt hash, and QC result. Idempotent per attempt; a killed worker must resume without duplicate spend.

### MediaAsset
Any stored file — brand assets, generated stills, finished renders, licensed UGC clips (with licence metadata) — living in R2 behind signed URLs. Filed into the Content Library / Media Library (STEP 8.6).

### CalendarSlot
A scheduled position in a workspace's publishing calendar — platform, timezone-aware datetime, and the `ContentItem` assigned to it (STEP 10). Auto-fill assigns these under **C6** (platform rate caps), format-diversity, and hook-pattern-rotation constraints.

### Publication
One attempt (or the record of a successful attempt) to publish a `ContentItem` to a `SocialAccount` via a platform's official API (STEP 12). Idempotency-keyed — retries must never double-post. Preflight on this entity enforces **C1** (official APIs only), **C7** (recorded approval before publish), and **C8** (no platform branding in overlays).

### SocialAccount
An OAuth-connected TikTok/Instagram/YouTube account belonging to a `Workspace` (STEP 11). Holds `platform_credentials` (envelope-encrypted, never logged, never returned by any API) and rolling `platform_quota_state` counters that **C6** is enforced against.

### MetricSnapshot
A point-in-time ingestion of platform performance data (views, likes, shares, watch-time, etc.) or an attribution event, joined back to the `Publication`/`ContentItem`/`Angle`/hook-pattern that produced it (STEP 13). This is what closes the feedback loop into the Velocity bandit, the best-time model, and the hook-pattern weights — without it the product is a generator, not a growth tool.
