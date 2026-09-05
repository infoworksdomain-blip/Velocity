# BUILD SCRIPT — Short-Form Content Growth Platform
### Working title: **VELOCITY** · v2 · Target IDE: Visual Studio Code + Claude Code

---

## 0. HOW TO USE THIS SCRIPT

You are building a multi-tenant SaaS platform that takes a website URL and produces, schedules and publishes short-form video and slideshow content to TikTok, Instagram Reels and YouTube Shorts, with performance attribution feeding back into generation.

**Rules of engagement:**

1. Execute **one STEP at a time**. Do not begin a step until the previous step's **GATE** passes.
2. At the start of each step, write `/docs/steps/STEP-NN.md` with your plan, the files you will create, and the acceptance tests. Wait for approval before writing code.
3. At the end of each step: migrations applied, tests green, `pnpm typecheck` clean, `pnpm lint` clean, and a demo path a human can click through.
4. Report gate results honestly. **Never report a gate as passed if any check failed.** If a gate fails, stop and report rather than working around it.
5. Never invent a third-party API contract. If unsure of a provider's request/response shape, stop and ask, or write the adapter against a recorded fixture and flag it as unverified.
6. No secrets in code. Everything through env vars with a checked-in `.env.example`.
7. If you disagree with an instruction here, say so before implementing it.

**Cut line:** STEPS 1–12 are the MVP. STEPS 13–22 are phase two. Hard checkpoint after STEP 12.

---

## 0.1 VISUAL STUDIO CODE SETUP (do this before STEP 1)

Create these before any application code. They make every later session cheaper.

**`CLAUDE.md`** at repo root — Claude Code reads this at the start of every session. It must contain: the seven non-negotiable constraints from §1, the naming conventions from STEP 1, the design tokens from Appendix A, the commands to run tests and gates, and a "current step" line you update as you progress.

**`.vscode/extensions.json`**
```json
{ "recommendations": [
  "anthropic.claude-code", "dbaeumer.vscode-eslint", "esbenp.prettier-vscode",
  "bradlc.vscode-tailwindcss", "ms-azuretools.vscode-docker",
  "vitest.explorer", "usernamehw.errorlens", "yoavbls.pretty-ts-errors",
  "prisma.prisma", "graphql.vscode-graphql-syntax", "ms-playwright.playwright"
] }
```

**`.vscode/settings.json`** — format on save, ESLint as fixer, Tailwind IntelliSense class regex for `cva`/`clsx`, TypeScript SDK from workspace, exclude `node_modules`/`.next`/`out` from search.

**`.vscode/launch.json`** — compound config: Next.js server-side debug, Next.js client-side Chrome debug, worker process attach on 9229, Vitest current file.

**`.vscode/tasks.json`** — tasks for: `docker compose up` (Postgres + Redis + MinIO + Temporal), `temporal server start-dev`, `pnpm dev`, `pnpm remotion studio`, `pnpm db:push`, `pnpm gate:NN`.

**`.devcontainer/devcontainer.json`** — Node 22, pnpm, ffmpeg, Python (for WhisperX), Docker-in-Docker. This removes "works on my machine" from the render pipeline, which is the part most sensitive to local ffmpeg versions.

**`.claude/commands/`** — reusable slash commands:
- `plan-step.md` — "Read /docs/steps/STEP-{{n}}.md, produce the implementation plan, list files, list tests, stop."
- `gate-check.md` — "Run every acceptance check for STEP {{n}}. Report a table of check/expected/actual/pass. Do not fix anything in this run."
- `provider-adapter.md` — "Scaffold a new provider adapter conforming to packages/providers/types.ts, with a fixture-backed test."

**Terminal layout to keep open:** `pnpm dev` · worker · `temporal server start-dev` · `pnpm remotion studio` (this last one is how you iterate on the text overlay system in STEP 8B without burning render credits).

---

## 1. NON-NEGOTIABLE CONSTRAINTS

| # | Constraint |
|---|---|
| C1 | **Official APIs only.** All publishing via TikTok Content Posting API, Instagram Content Publishing API and YouTube Data API with user OAuth. No headless-browser posting, no unofficial endpoints, no session-token replay, no automated account creation, no account trading. |
| C2 | **Provenance is mandatory.** Every generated asset carries a C2PA manifest, preserves any model-native watermark, and sets an immutable `ai_generated` flag. Platform-native AI labels set on publish. EU AI Act Art. 50 has applied since 2 Aug 2026 and the platform serves EU users. |
| C3 | **No third-party footage redistribution.** Trend analysis stores *blueprints* (structure, pacing, hook pattern, caption grammar), never re-hosted or re-cut source clips. Human UGC library licensed with signed model releases recorded per clip. |
| C4 | **Tenant isolation by default.** Postgres RLS on every tenant table. Tested adversarially in STEP 20. |
| C5 | **Cost metering from first generation.** Every model call — video, image, **and text** — writes a `usage_event` with provider, model, units and cost before the response returns. No un-metered path may exist. |
| C6 | **Platform rate caps enforced client-side.** The scheduler must never emit a request that would breach a documented platform cap. Caps live in config, not code. |
| C7 | **Human approval before publish** for all AI-persona content. No autonomous path from generation to public post without a recorded approval event. |
| C8 | **No platform branding burned into content.** TikTok's watermark guidelines prohibit superimposing your own brand, logo, watermark or promotional text on content shared to TikTok. Overlays render the *customer's* brand only. Never inject a VELOCITY mark into an export. |

---

## 2. TARGET STACK

- **App:** Next.js 15 (App Router), TypeScript strict, React Server Components
- **API:** tRPC internally; versioned REST (`/v1`) public; OpenAPI 3.1 generated from Zod
- **DB:** PostgreSQL 16 + `pgvector` + RLS, Drizzle ORM (Neon or Supabase)
- **Queue:** Redis + BullMQ for short jobs; **Temporal** for render and publish workflows (multi-minute, multi-vendor, must survive worker restarts)
- **Storage:** Cloudflare R2 + CDN, signed URLs only
- **Render:** **Remotion** (React → MP4) on Lambda; ffmpeg for transcode and loudness
- **Text/LLM:** Anthropic Messages API + OpenAI Responses API behind one abstraction (STEP 8B)
- **Auth:** Auth.js or Clerk; OAuth for socials; per-workspace RBAC
- **Payments:** Stripe (subscriptions + metered credits)
- **Observability:** OpenTelemetry → Grafana, Sentry, PostHog

---

## 3. USER TYPES

**3.1 Individual** — founders, creators, influencers, freelancers, consultants. Single workspace, single seat, personal-brand voice, "my persona" flows, simpler dashboard, self-serve billing. Onboarding accepts a URL *or* a social handle (creators often have no site).

**3.2 Business** — SaaS, e-commerce, agencies, apps, local businesses, startups, professional services. Multi-workspace, multi-seat with roles, brand-guideline enforcement, approval workflows, team calendar, client reporting, SSO on higher tiers. Onboarding takes the URL, detects category, offers a category-specific angle set (e-commerce → product/offer; SaaS → problem/solution; local → location and service-area).

`workspace_type` enum drives feature flags, default automations and onboarding branch. Individual → Business conversion without data migration.

---

## 4. MODULE MAP — STEPS

| # | Module | Step | # | Module | Step |
|---|---|---|---|---|---|
| 1 | Dashboard | 7 | 24 | MCP server | 16 |
| 2 | AI Growth Brain | 14 | 25 | Webhooks | 16 |
| 3 | Blitz | 9 | 26 | Agency Mode | 17 |
| 4 | Content Studio | 8, 8B, 10 | 27 | Client Portal | 17 |
| 5 | Content Library | 8 | 28 | White-label | 17 |
| 6 | Inspiration / Trending | 8 | 29 | Creator Marketplace | 17 |
| 7 | AI UGC Studio | 15 | 30 | Managed Distribution | 17 |
| 8 | AI Influencer Studio | 15 | 31 | Admin Dashboard | 18 |
| 9 | Campaigns | 10 | 32 | User Management | 18 |
| 10 | Content Calendar | 10 | 33 | Workspace Management | 18 |
| 11 | Social Accounts | 11 | 34 | Subscription Management | 19 |
| 12 | Analytics | 13 | 35 | Usage Management | 19 |
| 13 | Competitor Intelligence | 14 | 36 | AI Model Management | 18 |
| 14 | Brand Manager | 6 | 37 | Content Moderation | 18 |
| 15 | Media Library | 8 | 38 | Social Integration Mgmt | 18 |
| 16 | AI Assistant | 14 | 39 | Payments | 19 |
| 17 | Automation Engine | 16 | 40 | Credits | 19 |
| 18 | Website Intelligence | 6 | 41 | System Health | 18 |
| 19 | Team / Workspaces | 4 | 42 | Audit Logs | 18 |
| 20 | Billing | 19 | 43 | Support | 18 |
| 21 | Notifications | 7 | 44 | Feature Flags | 18 |
| 22 | AI Agents | 16 | 45 | Configuration | 18 |
| 23 | Public API | 16 | 46 | Fraud / Risk | 18 |

---

# THE STEPS

---

## STEP 1 — ARCHITECTURE

Deliver `/docs/architecture/` with C4 context/container/component diagrams (Mermaid), an ADR folder, repo skeleton and CI.

Monorepo (pnpm + Turborepo): `apps/web`, `apps/worker`, `apps/render`, `packages/db`, `packages/core`, `packages/providers`, `packages/text-engine`, `packages/contracts`, `packages/ui`.

Define the domain model in prose first — Organisation, Workspace, BrandProfile, Angle, TrendBlueprint, Persona, ContentConcept, **TextPlan**, ContentItem, Render, MediaAsset, CalendarSlot, Publication, SocialAccount, MetricSnapshot. These names propagate everywhere; get them right now.

ADRs for: Temporal vs BullMQ · Remotion vs pure ffmpeg · RLS vs schema-per-tenant · provider-abstraction design · **LLM structured-output strategy (Anthropic forced tool use vs OpenAI strict JSON schema)**.

Threat model sketch: tenant isolation, OAuth token custody, SSRF on user-supplied URLs (brand ingest fetches arbitrary URLs — real attack surface), prompt injection from scraped page content.

**GATE 1:** Diagrams committed. `pnpm build` green on a clean clone. ADRs merged.

---

## STEP 2 — DATABASE

Full schema, migrations, seed data, RLS policies.

```
organisations, workspaces, users, memberships, roles, invitations
brand_profiles (versioned), brand_assets, brand_rules
angles, trend_blueprints, personas, ugc_clips (licensed, release_ref)
content_concepts, storyboards, text_plans, hook_variants, content_items
renders, media_assets, fonts, text_style_presets
blitz_sessions, blitz_events
campaigns, calendar_slots, schedules, publications, publication_attempts
social_accounts, platform_credentials (encrypted), platform_quota_state
metric_snapshots, attribution_events, link_shorts
credit_ledger, usage_events, subscriptions, invoices
automations, automation_runs, agent_runs
api_keys, webhooks, webhook_deliveries
audit_logs, feature_flags, moderation_reviews, risk_signals
```

Rules: every tenant table has `workspace_id` + RLS `USING (workspace_id = current_setting('app.workspace_id')::uuid)`. `platform_credentials` envelope-encrypted via KMS, never logged, never returned by any API. `credit_ledger` append-only, double-entry, balance as materialised view. `audit_logs` append-only, no delete grant. pgvector HNSW on `brand_profiles.embedding`, `trend_blueprints.embedding`, `content_concepts.embedding`, `hook_variants.embedding`. Soft delete on user content; hard-delete jobs for GDPR erasure.

**GATE 2:** Migrations up and down cleanly. A *generated* test enumerates every tenant table and proves tenant A gets zero rows of tenant B's data (a hand-written table list will drift).

---

## STEP 3 — AUTHENTICATION / RBAC

Signup, login, email verification, password reset, TOTP MFA, OAuth social login, session management, RBAC engine.

Roles: `owner`, `admin`, `editor`, `contributor`, `viewer`, `client`, `agency_manager`; platform-level `superadmin`, `support`, `moderator`, `finance`.

Permission model: resource + action + scope (`content:publish:workspace`). One central policy module — no `if (role === 'admin')` scattered around. Every tRPC procedure declares its required permission. Session revocation, device list, time-boxed support impersonation (audit-logged, banner shown to the impersonated user), API-key auth path stubbed for STEP 16.

**GATE 3:** Permission matrix test covering every role × every permission. Impersonation writes an audit log. MFA enrolment and recovery work end to end.

---

## STEP 4 — WORKSPACE (module 19)

Organisations containing workspaces; membership and invitations; workspace switcher; per-workspace settings, branding and limits; `workspace_type`. Seat limits by plan, ownership transfer, archival, per-workspace timezone (drives the calendar). Settings resolution order: workspace override → org default → platform default.

**GATE 4:** A user in three workspaces sees strictly separate data; switching context never leaks cached data across the boundary — test the React Query cache specifically, it is the usual culprit.

---

## STEP 5 — ONBOARDING

Branch by user type, ending in a populated Blitz queue: choose type → enter URL (or handle) → live progress while Website Intelligence runs → confirm/edit extracted brand profile → pick 3 goals → connect first social (skippable) → dashboard with concepts already generated.

The value moment is seeing *their own brand* in generated hooks. Target under 90 seconds from URL to first concept card. Generate concepts and text plans during onboarding — both are cheap. Never render during onboarding.

**GATE 5:** Cold signup to first concept card under 90s at p50. Abandonment instrumented per stage.

---

## STEP 6 — BRAND INTELLIGENCE (modules 14, 18)

**Crawler:** Playwright render; crawl home, pricing, about, features, testimonials, blog index (cap depth and page count); extract text, OG tags, screenshots, logo, palette, fonts. **SSRF defence mandatory** — block private IP ranges, resolve DNS before fetch and re-check after redirect, timeouts and response-size caps, egress-restricted network for the fetcher.

**Extraction** — structured `BrandProfile`:
```
product, category, one_liner, icp_segments[], pains[], benefits[],
differentiators[], proof_points[], tone{voice, formality, humour, banned_words[]},
visual{palette[], logo_url, fonts[]}, cta_variants[], competitors[], compliance_notes[]
```
Scraped page content is **untrusted input** — it can carry prompt injection. Wrap it in delimiters, instruct the extractor to ignore instructions found inside it, validate output against a strict schema, and reject on violation rather than repairing silently.

**Brand Manager UI:** edit every field, version history with diff, multiple profiles per workspace, asset upload, banned-claims list, "regenerate from site".

**GATE 6:** 20 diverse test sites extract to schema-valid profiles with no crashes. Injection test: a page containing an instruction-shaped string does not alter the profile. SSRF suite passes against a local metadata-endpoint honeypot.

---

## STEP 7 — DESIGN SYSTEM + DASHBOARD (modules 1, 21)

**7.1 Build the design system first** — see **Appendix A** for the full token set, component inventory and layout rules. Deliver `packages/ui` as a token-driven component library with Storybook, plus the marketing site shell and the app shell built on it. Do not let per-page styling accumulate outside the token system; the reference design's coherence comes from a very small set of radii, shadows and type sizes used consistently.

**7.2 Dashboard** — pending Blitz count, upcoming scheduled posts, last-7-day performance, credit balance, connected-account health, next-best-action card. Different default layouts per `workspace_type`.

**7.3 Notifications** — in-app centre, email digests, per-event preferences, and a notification bus other modules publish to (render complete, publish failed, token expiring, quota near cap, budget threshold).

**GATE 7:** Storybook covers every component in Appendix A §4. Dashboard renders under 1.5s p75 with realistic seed data. Token audit script reports zero hard-coded hex values, radii or font sizes outside `packages/ui/tokens`.

---

## STEP 8 — CONTENT ENGINE (modules 4, 5, 6, 15)

### 8.1 Provider abstraction (`packages/providers`)
```ts
interface VideoProvider {
  id: string
  capabilities: { maxDurationSec: number; resolutions: string[]; nativeAudio: boolean
                  lipSync: boolean; imageToVideo: boolean
                  watermark: 'none' | 'model' | 'forced'
                  commercialUse: boolean; costPerSecond: number }
  generate(input: VideoJobInput): Promise<ProviderJobHandle>
  poll(handle: ProviderJobHandle): Promise<ProviderJobStatus>
}
```
Same shape for `ImageProvider`, `TTSProvider`, `TranscriptionProvider`, and `TextProvider` (STEP 8B).

A **router** selects per job from: capability match, cost ceiling, current latency/health, workspace tier, circuit-breaker state. Fallback chain on failure. Every provider swappable in config — Sora 2's API shuts down 24 September 2026, the standing example of why nothing hard-codes a vendor.

First roster: Kling 3.0, Veo 3.1, Seedance 2.5, MiniMax H3 (video); Seedream 5.0 (image); ElevenLabs or equivalent (TTS); WhisperX (alignment).

### 8.2 Angle & concept generation
Brand profile → N angles → for each angle × format × persona, a `ContentConcept`:
```
{ hook, angle_id, format, persona_id, blueprint_id, storyboard,
  text_plan_id, preview_asset, predicted_score, ai_generated: true }
```
Concepts are LLM-only and cheap. Generate in bulk. This is what fills Blitz.

### 8.3 Trend blueprints (module 6)
Ingest trending signals per niche; extract structure into `{hook_pattern, beat_timings[], shot_grammar, caption_cadence, text_placement, audio_archetype, niche_tags[], velocity_score}`. **Store structure, never source footage** (C3). Retrieval by vector similarity against the brand/angle embedding, weighted by recency and velocity.

### 8.4 Storyboard → render pipeline (Temporal workflow)
```
resolveAssets → generateShots → generateVO → align → composeText → compose
→ normalise → provenance → qc → publishReady
```
Each activity idempotent, retryable, with its own timeout and compensation. Partial failure must not orphan spend — if `compose` fails after four shot generations, those shots are cached and reused on retry.

Composition in Remotion. 1080×1920, H.264, −14 LUFS. `composeText` is STEP 8B.

**Provenance activity (C2):** attach C2PA manifest, preserve model watermark, set `ai_generated`, record model + prompt hash in `renders`.

**QC activity:** safety classifier, banned-claim check, pHash near-duplicate check against workspace history, **caption legibility and safe-area check** (8B.5), audio presence, duration/aspect validation. Failures route to regeneration, not to the user.

### 8.5 The four formats
1. **AI UGC talking head** — persona reference image → image-to-video with lip-sync + VO
2. **Slideshow** — 6–10 generated images + per-slide overlay text, exported as an image set (TikTok photo posts are **URL-pull only**)
3. **Hook + demo** — talking hook cut to product screen capture with motion
4. **Meme** — template + generated caption bar

### 8.6 Content Library + Media Library
Everything generated is filed, searchable (semantic + tag), versionable, duplicable, editable, exportable. Media Library holds brand assets, generated stills, renders and licensed clips with licence metadata.

**GATE 8:** 100 concurrent renders complete with <2% failure. A killed worker mid-render resumes without duplicate spend. Every render carries a valid C2PA manifest. `usage_events` reconcile to within 1% of provider-reported cost. Cost per finished 20s video measured and documented.

---

## STEP 8B — HOOK & ON-SCREEN TEXT ENGINE (Anthropic / OpenAI)

*This is a new first-class subsystem. It is what makes the content look native rather than generated, and it is the cheapest lever on performance in the whole product — the hook decides the first 1.5 seconds, and the first 1.5 seconds decide the video.*

### 8B.1 `packages/text-engine` — the provider abstraction

```ts
interface TextProvider {
  id: 'anthropic' | 'openai'
  model: string
  generateStructured<T>(args: {
    system: string
    input: string
    schema: JSONSchema        // the contract
    maxTokens: number
    temperature: number
  }): Promise<{ data: T; usage: TokenUsage; costUsd: number }>
}
```

**Anthropic adapter** — Messages API. Get structured output by defining a single tool whose `input_schema` is the target schema and forcing `tool_choice: { type: 'tool', name: 'emit_text_plan' }`. Read the result from the `tool_use` block. Set a low temperature (0.7 for hooks where you want variance, 0.2 for compliance rewrites).

**OpenAI adapter** — Responses API with a strict JSON schema response format. Same schema object, converted by a shared adapter so **one schema definition serves both providers**. Do not maintain two schemas.

**Routing policy** (config, not code):
| Job | Default | Fallback | Why |
|---|---|---|---|
| Hook variants | Anthropic | OpenAI | Long-form voice control, brand-tone adherence |
| Caption/beat text | Anthropic | OpenAI | Consistency with hook voice |
| Compliance rewrite | Anthropic (temp 0.2) | OpenAI | Deterministic constraint satisfaction |
| Bulk concept fan-out | cheapest healthy | either | Volume job, cost-dominated |

Both providers metered into `usage_events` (C5). Text is 3–4 orders of magnitude cheaper than video — generate liberally, render sparingly.

### 8B.2 The `TextPlan` contract

One JSON object per content item, produced by the LLM, consumed by Remotion. This is the interface between the two halves of the system, so freeze it early.

```jsonc
{
  "version": "1.0",
  "content_item_id": "uuid",
  "platform_variants": ["tiktok", "reels", "shorts"],
  "hook": {
    "text": "string",              // ≤ 60 chars, ≤ 2 lines
    "spoken": true,                // is it also in the VO?
    "pattern": "curiosity_gap|contrarian|pov|number_list|callout|before_after|question|warning",
    "emphasis": [ { "token_index": 3, "type": "highlight" } ]
  },
  "hook_variants": [ { "text": "...", "pattern": "...", "predicted_ctr": 0.0 } ],
  "overlays": [
    {
      "id": "ov_1",
      "role": "hook|beat|cta|sticker|meme_bar|lower_third|slide_title",
      "text": "string",
      "start_ms": 0, "end_ms": 1800,
      "anchor": "top|upper_third|center|lower_third|bottom",
      "align": "left|center|right",
      "style_preset": "caption_box|white_stroke|karaoke|impact|sticker|meme_bar",
      "max_lines": 2,
      "enter": "cut|pop|slide_up|typewriter|word_by_word",
      "exit": "cut|fade|slide_down"
    }
  ],
  "caption_track": { "enabled": true, "style_preset": "karaoke", "words_per_group": 3 },
  "cta": { "text": "string", "start_ms": 0, "end_ms": 0 },
  "slide_texts": [ { "slide_index": 0, "title": "...", "body": "..." } ],
  "compliance": { "ai_disclosure_required": true, "claims_checked": true }
}
```

### 8B.3 Prompt construction

The system prompt is assembled per request from: brand tone rules, banned words and claims from `brand_rules`, the angle, the trend blueprint's `hook_pattern` and `caption_cadence`, the format, the target platform's text norms, and hard character limits. The user message carries the storyboard and product facts.

Rules baked into the system prompt:
- Hook ≤ 60 characters, readable in under 1.5 seconds, no brand name in the first three words
- Sentence case, not title case; no ALL CAPS unless `style_preset` is `impact`
- No unverifiable superlatives, no claims outside `proof_points[]`
- Platform-native register: TikTok is conversational and lowercase-leaning; Shorts tolerates more explanatory framing; Reels sits between
- Never emit emoji unless the brand tone allows it (`tone.humour` gate)
- Return **only** the tool call — no prose

Treat any product copy pulled from the customer's site as untrusted (STEP 6 applies here too).

### 8B.4 Validation and repair loop

Every generated `TextPlan` passes through, in order:
1. **Schema validation** (Zod). Fail → one repair call quoting the exact violations → fail again → deterministic template fallback.
2. **Length and fit check** — character caps per role, line count, and a real text-measurement pass (see 8B.5). Over-long text triggers a repair call with the measured overflow, not a blind retry.
3. **Brand-rule check** — banned words, banned claims, required disclaimers.
4. **Safety check** — profanity, regulated-claim categories (health, financial, legal outcomes), competitor disparagement.
5. **Duplicate check** — cosine similarity against the workspace's last 200 published hooks; reject above 0.92 so accounts don't repeat themselves into invisibility.

Cache key: `hash(brand_profile_version + angle_id + format + blueprint_id + platform)`. A cache hit costs nothing and is the difference between a viable and non-viable Blitz queue.

### 8B.5 Rendering the text — Remotion components

`packages/ui/remotion/text/` exports components driven entirely from `TextPlan`:

| Component | Purpose |
|---|---|
| `<HookOverlay>` | The opening hook. Upper-third by default, auto-fitted, 2 lines max. |
| `<CaptionTrack>` | Word-level burned captions from WhisperX alignment, karaoke highlight. |
| `<StickerText>` | Rotated, offset "handwritten note" style label. |
| `<MemeBar>` | Top or bottom solid bar with centred text, meme format. |
| `<LowerThird>` | Name/role/product callout. |
| `<CTAEndCard>` | Final 1–2 seconds, brand mark plus action. |
| `<SlideText>` | Per-slide title and body for slideshow format. |

**Auto-fit algorithm.** Measure with canvas `measureText` against the loaded font at render time. Binary-search font size between `min` and `max` for the preset until the text fits `max_lines` within the safe box. Break lines on phrase boundaries (after prepositions and conjunctions, never mid-noun-phrase) rather than on word count. Never let the model choose the font size — it will be wrong; the model chooses the *words*, the renderer chooses the *size*.

**Legibility.** Sample mean luminance of the underlying frame inside the overlay's bounding box at the overlay's start frame and midpoint. Below threshold → light text with dark stroke; above → dark text on a light plate. Every preset defines both treatments. Minimum contrast ratio 4.5:1 measured, not assumed.

**Safe areas — the detail everyone gets wrong.** Platform UI chrome covers parts of the frame. At 1080×1920, keep all text inside:

| Platform | Top inset | Bottom inset | Right inset | Left inset |
|---|---|---|---|---|
| TikTok | 180px | 500px | 220px | 40px |
| Instagram Reels | 160px | 400px | 180px | 40px |
| YouTube Shorts | 140px | 320px | 180px | 40px |

Keep these in `config/safe-areas.json` and version them — platforms move their chrome. The renderer clamps every overlay into the intersection of all target platforms' safe boxes when one render serves multiple platforms, or renders per-platform variants when the text would have to shrink below the preset's minimum.

**Style presets** live in `text_style_presets` (DB) so they are editable without deploy: font family, weight, size range, tracking, line height, fill, stroke width and colour, shadow, plate fill and radius, padding, entrance timing curve.

### 8B.6 Hook A/B and the feedback loop

Generate 5–8 hook variants per concept in a single call (one call, array output — far cheaper than 8 calls). Store all of them in `hook_variants`. The Blitz card shows the top-ranked variant. On swipe-right, the chosen variant is bound to the content item; the rest stay available in Content Studio as one-click swaps that re-render only the text layer, not the video.

Because text is a separate composition layer, **re-rendering a hook is seconds and pennies, not minutes and pounds.** Build the pipeline so a text-only change reuses the cached video track. This makes hook A/B testing economically possible, which is the actual competitive advantage over the reference product.

`hook_pattern` becomes an arm in the Blitz bandit (STEP 9) and a dimension in analytics (STEP 13), so the system learns which hook patterns work for each brand.

### 8B.7 Content Studio — the manual editor

Everything above runs automatically, but the user must be able to intervene. Content Studio gives: inline hook editing with live character count and fit preview, variant picker, per-overlay timing drag on a timeline, style preset switcher, safe-area guides toggled per platform, and a "regenerate text only" button. Preview is the Remotion Player in the browser — no server render for text edits.

**GATE 8B:** One schema drives both Anthropic and OpenAI adapters with identical output shape (test asserts structural equality on the same input). Repair loop recovers ≥95% of schema failures without falling back to template. No overlay in a 500-render sample falls outside the safe box for its target platform. Text-only re-render completes in under 15 seconds and reuses the cached video track. Measured cost per TextPlan documented, and it is under 1% of the cost of the video render.

---

## STEP 9 — BLITZ (module 3)

**Two-tier queue:**
- Tier 1: **concept cards** — pre-warmed in bulk, LLM-cost only (concept + TextPlan + preview still), preview is a generated first frame with the real hook overlay composited on it
- Tier 2: **full render** — triggered only on swipe-right

Any design that renders before the swipe has unworkable unit economics. Do not build it.

Because 8B renders the hook onto the preview still, the Blitz card shows the user the *actual* hook they will publish, at concept cost. This is the single highest-leverage interaction in the product.

**Queue service:** maintains ≥50 ranked concepts per active workspace; background top-up below 10; expires stale concepts as blueprint velocity decays.

**Ranking:** Thompson sampling over `angle × format × persona × blueprint × hook_pattern` arms. Per-workspace preference vector. Cold-start from the brand embedding; update on every swipe; re-weight from published performance (STEP 13 closes this loop).

**Telemetry per swipe:** direction, dwell time before decision, preview watched to completion, replays, post-save edits. Dwell time is the strongest signal and the one most implementations forget to log.

**Lifecycle:** `CONCEPT → QUEUED → RENDERING → READY → SCHEDULED → PUBLISHED`, terminals `REJECTED`, `FAILED`.

**Front-end:** prefetch 20 cards, preload next 3 previews, optimistic swipe UI, IndexedDB cache, gesture + keyboard + button parity for accessibility, undo last swipe. **Swipe-to-next latency budget: under 100ms.** The mechanic dies above that.

**GATE 9:** p95 swipe latency <100ms on a mid-range mobile device over 4G. Queue never starves in a 200-swipe session. Preference model measurably shifts the served distribution after 50 swipes — write the test that proves it.

---

## STEP 10 — CALENDAR (modules 4, 9, 10)

Month/week/list/table views, drag-to-reschedule, campaigns as groupings, recurrence, bulk actions, and the **30-day one-shot auto-fill**.

Auto-fill: determine slots per platform per day from plan limits and workspace timezone → rank by a best-time model (platform heuristics per niche initially, replaced by the workspace's own data once STEP 13 has ~30 days) → assign saved content under constraints: per-account platform caps (C6), minimum spacing, **format diversity** (no two consecutive posts of the same format), **hook-pattern rotation** (no two consecutive posts using the same hook pattern — this matters more than format diversity for feed fatigue), angle rotation, campaign windows → present as a diff the user approves before commit.

**GATE 10:** 30-day fill across 3 platforms and 5 accounts yields zero cap violations, zero double-bookings, correct local times across a DST boundary. Test a Europe/London workspace with America/New_York accounts.

---

## STEP 11 — SOCIAL INTEGRATIONS (module 11)

OAuth connect/disconnect/reconnect for TikTok, Instagram, YouTube; per-account health; quota state.

**TikTok** — Content Posting API. Upload (draft to inbox) and Direct Post (`video.publish` scope). Video by file upload or URL pull; **photos URL-pull only**. Unaudited clients: forced `SELF_ONLY`, max 5 users posting per 24h, accounts must be private. Audited: all privacy levels, plus a 24h creator cap from your audit application and a per-creator cap (~15 posts/day) shared across all API clients. **6 requests/minute per user token.** No superimposed branding on shared content (C8).
→ **Build Upload/draft mode first and ship on it.** Gate Direct Post behind a feature flag, enabled per workspace once your client passes audit. Start the audit application in parallel with this step — it is on the critical path and takes weeks.

**Instagram** — Business/Creator only. `POST /{ig-user-id}/media` (`media_type=REELS`) → poll container `status_code` until `FINISHED` → `POST /{ig-user-id}/media_publish`. Media must be publicly reachable at attempt time. **100 API-published posts per rolling 24h per account**; poll `GET /{ig-user-id}/content_publishing_limit` and enforce it yourself. Reels ~90s API cap.

**YouTube** — `videos.insert` resumable upload. Design to the **100 calls/day at 1 unit** bucket; the widely-cited 1,600-units figure is stale and survives only in an auto-generated doc summary. File for a quota extension before you need it.

Plus: token refresh daemon with T-7/T-3/T-1 notifications, `platform_quota_state` rolling-window counters, reconnect flow preserving scheduled posts.

**GATE 11:** Connect and publish a test post on all three platforms. Token refresh proven by fast-forwarding expiry. Quota counters correct under concurrent publishes. A revoked token yields a clear reconnect prompt, not a silent failure.

---

## STEP 12 — PUBLISHING (module 4)

```
preflight → mediaStage → platformInit → upload → poll → confirm → record
```

**Preflight:** validate spec compliance per platform, quota headroom, token validity, QC pass, provenance stamp, recorded user approval (C7), and **no platform branding in overlays** (C8).

**Idempotency:** every attempt keyed; retries never double-post. This is the most damaging bug class in the category — a duplicate post costs the customer reputation and cannot be undone.

**AI labelling on publish (C2):** set TikTok's and Meta's AI-generated content flags for any item with `ai_generated = true`.

**Failure taxonomy:** transient (retry with backoff) · terminal (surface with a specific remedy) · quota (auto-reschedule to the next free slot).

### → MVP CHECKPOINT
Stop here. Report go/no-go with measured cost per published post and p50 signup-to-first-publish. Get real users on this before building 13–22.

**GATE 12:** 50 scheduled posts publish across three platforms with zero duplicates, zero cap breaches, correct AI labels. Chaos test: kill workers mid-publish; nothing double-posts.

---

## STEP 13 — ANALYTICS (module 12)

Metric ingestion per platform (views, likes, comments, shares, watch-time, follows, profile visits) on a schedule respecting read quotas. Website attribution: short-link domain + UTM + a server-side event endpoint the customer installs, joining post → click → signup → conversion. Dashboards per post, format, angle, persona, platform, **hook pattern**, and cohort by publish date. Outlier detection. CSV export and scheduled email reports.

**Close the loop:** performance updates the Blitz bandit priors (STEP 9), the best-time model (STEP 10), and the hook-pattern weights in 8B. Without this the product is a generator, not a growth tool.

**GATE 13:** Metrics reconcile with platform-native insights within tolerance. Attribution joins click to signup end to end. Bandit priors demonstrably shift after ingesting winner data.

---

## STEP 14 — AI GROWTH BRAIN (modules 2, 13, 16)

Weekly analysis producing ranked, specific recommendations grounded in the workspace's own data, including hook-level findings ("curiosity-gap hooks outperform contrarian 2.4x on your account — shift the mix"). Competitor Intelligence: track named competitor public accounts, extract format/cadence/angle patterns (public data, blueprints only, C3). AI Assistant: chat over the workspace's content, brand and performance data with tool access to create concepts, schedule and pull analytics.

**The assistant must disclose it is AI at the point of interaction** (Art. 50(1)) — in the interface, not in the terms.

**GATE 14:** Recommendations cite the data behind them. The assistant cannot reach another workspace's data (adversarial prompt test). Every assistant tool call is audit-logged.

---

## STEP 15 — UGC (modules 7, 8)

**AI UGC Studio:** character library with attributes (age band, gender presentation, style, setting, energy), consistent identity via reference-image conditioning, script → performance, batch generation.

**AI Influencer Studio:** create and own a persona — appearance, voice, tone, backstory — reusable across every video, with identity consistency scoring across renders.

Hard requirements: provenance and `ai_generated` on every persona asset (C2) · **no likeness of a real identifiable person** without a recorded, verifiable consent artefact, built as a first-class object with the release document attached and generation blocked without it · licensed human UGC with signed model release reference and usage rights (territory, duration, media) enforced at selection time · persona-level policy blocking regulated-claim categories unless the workspace has passed manual review.

**GATE 15:** Identity consistency measured across 20 renders of one persona. Attempting to generate a real named public figure is refused. Every library clip resolves to a licence record.

---

## STEP 16 — AUTOMATION (modules 17, 22, 23, 24, 25)

**Automation Engine:** trigger → condition → action. Triggers: schedule, performance threshold, new blueprint in niche, low queue, competitor post, product-feed change. Actions: generate batch, auto-schedule, notify, pause campaign, boost variants of a winner, **regenerate hooks for underperformers**. Dry-run mode, run history, per-automation spend cap.

**AI Agents:** goal-directed runs ("keep my calendar full for 30 days within 400 credits"). Hard spend ceiling, approval gates (C7), full step trace, kill switch.

**Public API (`/v1`):** REST, OpenAPI 3.1, API-key auth scoped to workspace + permission, cursor pagination, rate limits, idempotency keys on writes.

```
/v1/brands                      GET POST PATCH
/v1/brands/:id/analyze          POST
/v1/concepts                    GET POST
/v1/concepts/:id/approve        POST
/v1/content                     GET POST PATCH DELETE
/v1/content/:id/text            GET POST PATCH   — TextPlan CRUD
/v1/content/:id/hooks           GET POST         — generate / list variants
/v1/content/:id/render          POST
/v1/content/:id/render-text     POST             — text-only re-render
/v1/renders/:id                 GET
/v1/media                       GET POST
/v1/personas                    GET POST
/v1/blueprints                  GET
/v1/text-presets                GET POST PATCH
/v1/blitz/queue                 GET
/v1/blitz/events                POST
/v1/calendar/slots              GET POST PATCH DELETE
/v1/calendar/autofill           POST
/v1/schedules                   GET POST
/v1/publish                     POST
/v1/publications/:id            GET
/v1/accounts                    GET DELETE
/v1/accounts/connect            POST
/v1/analytics/posts             GET
/v1/analytics/summary           GET
/v1/analytics/hooks             GET              — hook-pattern performance
/v1/automations                 GET POST PATCH DELETE
/v1/credits                     GET
/v1/webhooks                    GET POST DELETE
```

**Webhooks:** `render.completed`, `render.failed`, `text.generated`, `publication.succeeded`, `publication.failed`, `concept.batch_ready`, `quota.threshold`, `credits.low`, `account.token_expiring`. HMAC-signed, exponential-backoff retries, delivery log, replay endpoint.

**MCP server:** tools mapping 1:1 onto the API — `analyze_website`, `generate_concepts`, `generate_hooks`, `update_text_plan`, `list_blitz_queue`, `approve_concept`, `render_content`, `render_text_only`, `get_render_status`, `list_accounts`, `schedule_post`, `publish_now`, `autofill_calendar`, `get_analytics`, `get_credit_balance`. Streamable HTTP transport, OAuth-scoped, same permission model. **Publishing tools require an explicit confirmation parameter** — an agent must not post to a customer's real audience on an ambiguous instruction.

**GATE 16:** OpenAPI spec validates; generated client passes integration suite. MCP server works end to end against a real client. An agent run cannot exceed its spend cap. Webhook signatures verify; replay works.

---

## STEP 17 — AGENCY (modules 26–30)

Agency Mode: manage N client workspaces from one console, cross-client calendar and reporting, bulk operations, client budgets. Client Portal: read-only or approval-only branded surface. White-label: custom domain, logo, palette, email sender domain, optional "powered by" removal by plan — the design token system from Appendix A must be themeable per tenant for this to work, so build tokens as CSS custom properties resolved at runtime, not compiled Tailwind values.

**Creator Marketplace (29):** vetted creators who own their accounts, opt in, set rates, receive briefs, deliver, get paid. Identity verification, per-engagement contract, escrow, paid-partnership disclosure. This is the compliant answer to the demand competitors serve with account farming.

**Managed Distribution (30):** done-for-you tier — the agency runs strategy, generation and scheduling on the client's *own* connected accounts. A service-delivery layer, not an account-provision layer.

**GATE 17:** An agency user operates 10 client workspaces with no data bleed. White-label domain resolves with correct branding and TLS. A marketplace engagement completes: brief → delivery → approval → payment.

---

## STEP 18 — ADMIN (modules 31–33, 36–38, 41–46)

Admin dashboard, user management (search, suspend, audited impersonation), workspace management, **AI model management** (enable/disable providers, routing weights, cost ceilings, per-model kill switch — you will need this the next time a vendor deprecates at three weeks' notice), content moderation (review queue, appeals, policy versioning), social integration management (app credentials, per-platform audit status, global pause), system health, audit log viewer, support tooling, feature flags, configuration, fraud/risk (velocity rules, payment risk, abuse signals, disposable-email and multi-account detection).

**GATE 18:** Every destructive admin action audit-logged with actor, target, before/after. Feature flags evaluate per workspace and per user. A model kill switch takes effect within 60 seconds without a deploy.

---

## STEP 19 — BILLING (modules 20, 34, 35, 39, 40)

Stripe subscriptions plus metered credits. Ledger append-only and double-entry. Market anchor: 4 credits per image, 10 credits per second of video — a 20s video is 200 credits. **Price text generation separately and near-free**; it is the cheapest thing in the system and metering it punitively kills the hook A/B loop that differentiates you.

Implement plan limits, mid-cycle upgrade/downgrade with proration, top-up packs, overage policy, dunning, invoices, tax (Stripe Tax; UK-based, so VAT handling matters), refunds, hard spend cap per workspace. Model plans against measured cost per render from GATE 8 before publishing prices. Nightly reconciliation job alerting on >1% drift.

**GATE 19:** Full subscription lifecycle against Stripe test mode including failed payment and recovery. Ledger reconciles to provider costs. A workspace at its cap cannot generate.

---

## STEP 20 — SECURITY TESTING

Adversarial tenant-isolation suite across every API path, tRPC procedure, MCP tool, webhook and public endpoint · OWASP ASVS L2 · dependency and container scanning in CI · **prompt-injection suite against brand ingest, the text engine, the assistant and agent runs** · SSRF suite against the crawler · OAuth token custody review (encryption, rotation, revocation, no leakage in logs, traces or error payloads) · rate limiting and abuse (signup velocity, generation abuse, API-key abuse) · GDPR/UK-GDPR data map, DSAR export, erasure job, retention policy, sub-processor list, documented lawful basis for scraped-content processing · third-party penetration test before public launch.

**GATE 20:** Zero critical or high findings open. Isolation suite green. Pen-test report received and remediated.

---

## STEP 21 — PERFORMANCE TESTING

Targets: Blitz swipe p95 <100ms, queue never starves at 200 swipes · dashboard p75 <1.5s · 50 concepts generated in <20s · **TextPlan generation p95 <4s** · **text-only re-render p95 <15s** · render pipeline 500 concurrent, <2% failure, p95 <5min for 20s video · 1,000 scheduled posts published in an hour without cap breach · no DB query >100ms p95 under production-shaped load (check pgvector HNSW indexes specifically) · cost per published post tracked as a first-class metric.

Load-test with realistic tenant distribution (a few heavy workspaces, long tail). 24h soak for leaks. Document scaling knobs and where the next bottleneck sits.

**GATE 21:** All targets met or a documented, accepted deviation, with a runbook per bottleneck.

---

## STEP 22 — PRODUCTION DEPLOYMENT

Terraform IaC, blue/green or canary deploys, migration strategy with rollback, secrets management, backup plus **tested restore drill**, multi-AZ, CDN, WAF, DDoS protection.

Observability: SLOs for publish success rate, render success rate, text-engine success rate and Blitz latency, with error budgets and alert routing. Runbooks for provider outage, platform API outage, token mass-expiry, quota exhaustion, render backlog, payment failure spike.

Compliance artefacts before launch: privacy policy, terms, AI transparency statement (Art. 50), sub-processor list, cookie policy, DPA template, platform developer-terms compliance record for TikTok, Meta and Google.

Launch sequence: internal → 20 design partners → waitlist cohorts → public. Do not open the doors before the TikTok audit resolves; publishing behaviour changes materially when it lands, and you want that in front of 20 users, not 2,000.

**GATE 22:** Restore drill completed from a real backup. Canary rollback executed in staging. All SLO alerts fire correctly in a game-day exercise.

---

# APPENDIX A — DESIGN SYSTEM

The visual direction is set: replicate the reference product's aesthetic. It is a **motorsport-speed identity on a white canvas** — floating pill chrome, very large tight-tracked display type, generous white space, soft diffuse shadows instead of borders, one hot orange accent used sparingly, and a black-to-ember gradient as the only heavy element on the page.

Because the brief pins the direction, follow it exactly. Three conventions below (uppercase micro-labels, italic emphasis inside headlines, mono step numbers) are deliberate replications of the reference, not defaults to reach for elsewhere.

### A.1 Legal note before you build
Take the **system** — layout grammar, component structure, spacing rhythm, interaction patterns. Do not take the wordmark, the logo, the product name, the literal marketing sentences, or the licensed hero photography. Shift the accent hue meaningfully (see A.2) and use your own name and mark. Layout conventions are not protectable; a confusingly similar overall look-and-feel plus a similar name is trade dress, and it is a cheap lawsuit to bring.

### A.2 Colour tokens

```css
:root {
  --paper:        #FFFFFF;   /* primary canvas */
  --paper-2:      #F7F6F4;   /* alternating section wash, card interiors */
  --ink:          #101012;   /* display + headings */
  --ink-2:        #6E6E76;   /* body, secondary */
  --line:         #E9E7E4;   /* hairlines, pill borders */
  --flare:        #FF4D12;   /* single accent — CTAs, ticks, active states */
  --flare-deep:   #C9350A;   /* pressed states, gradient stop */
  --ember:        #0B0B0C;   /* gradient base for the divider + footer */
  --glow:         rgba(255, 77, 18, .26);  /* bloom behind hero media + primary CTA */
}
```

Accent discipline is what makes the reference look expensive: `--flare` appears on ticks, the primary button, active nav state and the ember gradient — nowhere else. If you shift the hue for differentiation, move it a real distance (a deep signal red `#E5203C` or an amber `#FF9500` both hold the motorsport register) rather than nudging it five degrees.

Dark mode for the app shell only, not the marketing site: invert `--paper`/`--ink`, keep `--flare` unchanged, drop `--glow` opacity to `.18`.

### A.3 Type

Two families, clearly distinct in role:

- **Display + UI:** a geometric grotesque with a true italic. Licensed option: Aeonik. Free alternatives with commercial licences: **Satoshi** or **General Sans** (Fontshare), or **Geist Sans**. You need at least Regular / Medium / Bold plus the italic cut — the italic is load-bearing in this design.
- **Micro-labels + numerals:** a mono. **Geist Mono** or **JetBrains Mono**.

Scale (self-host as woff2, subset, `font-display: swap`):

| Token | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| `display-1` | `clamp(2.75rem, 6.5vw, 5.5rem)` | 700 | −0.035em | 0.94 |
| `display-2` | `clamp(2rem, 4.2vw, 3.5rem)` | 700 | −0.03em | 1.02 |
| `heading` | `1.5rem` | 600 | −0.02em | 1.2 |
| `body-lg` | `1.125rem` | 400 | 0 | 1.6 |
| `body` | `1rem` | 400 | 0 | 1.6 |
| `label` | `0.75rem` mono | 500 | 0.14em, uppercase | 1 |
| `numeral` | `0.8125rem` mono | 500 | 0.08em | 1 |

Display lines centre-aligned in the hero and section openers; body copy left-aligned, max 62 characters. Emphasis words inside a display line are set in the **italic cut at the same weight** — that is the reference's signature move and the reason the italic is non-negotiable.

### A.4 Form, depth, motion

```css
--r-pill: 999px;   --r-card: 28px;   --r-media: 20px;   --r-field: 14px;
--sh-float: 0 8px 30px rgba(0,0,0,.08);   /* nav, primary buttons */
--sh-card:  0 2px 14px rgba(0,0,0,.05);   /* cards at rest */
--sh-glow:  0 0 80px var(--glow);         /* hero media, primary CTA only */
--space: 4px base; sections pad clamp(80px, 10vw, 160px) vertically;
--container: 1140px, 24px gutters;
```

Depth replaces borders. Cards sit on `--paper` with `--sh-card` and no outline; only pills and inputs take a `--line` hairline. Resist giving everything the same radius — `--r-card` for content cards, `--r-media` for video and image frames, `--r-pill` for anything clickable and small.

**Motion:** one orchestrated hero entrance on load, and that is all the un-triggered motion on the page. Everything else answers a user action. The exception, and it should be excellent: Blitz swipe physics — spring-based drag with ±12° rotation tied to horizontal displacement, colour wash on the card at commit threshold, and the next card scaling from 0.94 to 1.0 as the top card leaves. Respect `prefers-reduced-motion` by replacing the drag animation with a fade and keeping full button parity.

### A.5 Component inventory (`packages/ui`)

**Marketing shell**
`FloatingNav` (sticky centred pill, `--sh-float`, logo left, single CTA right, collapses to a sheet under 768px) · `AnnouncementPill` (small badge + sentence, links to app) · `HeroDisplay` (centred `display-1`, subhead at `body-lg` in `--ink-2`, CTA row) · `ProofBadges` · `DeviceFrame` (9:16 media in `--r-media` with `--sh-glow`, optional floating stat chips at the edges) · `LogoMarquee` (infinite scroll, grayscale, pauses on hover and on reduced-motion) · `SpotlightBlock` (label + `display-2` + paragraph + CTA + quote, asymmetric two-column) · `StepList` (mono numerals + heading + line of copy — the numbers are legitimate here because it genuinely is a four-step sequence) · `FeatureCard` (media panel on `--paper-2` above a heading and one line) · `ShowcaseGrid` (2-col 9:16 cards with an app avatar, name, type tag and metric row) · `PricingTier` (4 tiers plus an add-on strip; recommended tier lifted with `--sh-float`, not with a coloured border) · `TestimonialWall` (masonry of quote cards, source-linked) · `EmberDivider` (full-bleed radial arc, `--ember` core into `--flare` edge, the only saturated element on the page) · `FAQAccordion` · `SiteFooter` (four link columns, oversized wordmark, ember treatment).

**App shell**
`AppSidebar` (icon + label, active state in `--flare`) · `WorkspaceSwitcher` · `CreditMeter` · `StatCard` · `ContentCard` (9:16 thumbnail, hook text overlaid, state chip) · `BlitzDeck` + `BlitzCard` (full-bleed 9:16, hook rendered on the preview, swipe affordances, keyboard controls) · `CalendarGrid` / `CalendarSlot` · `TimelineEditor` (for TextPlan overlay timing, STEP 8B.7) · `SafeAreaOverlay` (toggleable platform guides) · `AccountChip` (avatar, platform mark, health dot) · `EmptyState` (an invitation to act, never an apology).

Density differs between shells: marketing uses the full `--space` rhythm; the app tightens to 0.75× vertical spacing and drops `--r-card` to 20px.

### A.6 Quality floor
Responsive to 360px · visible keyboard focus on every interactive element (`--flare` ring, 2px, 2px offset) · `prefers-reduced-motion` honoured · 4.5:1 minimum contrast (`--ink-2` on `--paper` passes; `--flare` on `--paper` does **not** pass for body text — use it for fills and large display only, never for small text) · all imagery has meaningful alt text · the Blitz deck fully operable by keyboard.

**Token audit script** (runs in CI, part of GATE 7): fail the build on any hex value, border-radius, font-size or box-shadow literal outside `packages/ui/tokens`.

---

# APPENDIX B — WHAT THIS BUILD EXCLUDES

Two features present in the reference product are deliberately absent. Do not add them, and raise it rather than implementing if asked.

1. **Provisioning, warming, selling or operating social accounts on behalf of users.** It violates TikTok's and Meta's terms (fake account creation, account trading, coordinated inauthentic behaviour), cannot run through the official publishing APIs, and risks your platform-level app credentials — which would take publishing down for every legitimate customer at once. Compliant substitutes: unlimited OAuth-connected accounts (STEP 11) and the Creator Marketplace (STEP 17).

2. **Re-hosting or re-cutting third-party creators' videos.** Trend intelligence is blueprint extraction (STEP 8.3): store the structure, generate original footage. Source clips are analysed, never redistributed.
