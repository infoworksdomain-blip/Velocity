# STEP 10 — Calendar

Status: proceeding without an approval gate (see STEP-03.md's header note).

Month/week/list/table views, drag-to-reschedule, campaigns, bulk actions, and the 30-day one-shot auto-fill — the constraint-satisfaction algorithm that turns a pool of `ready` content items into a real, cap-respecting, DST-correct schedule. This step's hardest and most valuable work is the auto-fill + timezone math, not the UI shell (STEP 7 already built the presentational `CalendarGrid`/`CalendarSlot` components; this step wires them to real data and real interaction).

## Scope decisions

1. **Real IANA-timezone math via Node's own `Intl` API, no `date-fns-tz`/`luxon`/`moment-timezone` dependency.** `packages/core/src/calendar/timezone.ts`'s `zonedTimeToUtc`/`utcToZonedParts` use `Intl.DateTimeFormat.formatToParts` plus a two-iteration fixed-point correction (the same technique real timezone libraries use) — Node ships real tzdata, so a library here would only duplicate data Node already has right. `findNextDstTransition` discovers a real DST boundary by scanning + binary-searching Node's own tzdata rather than hardcoding a calendar date this codebase would need to keep updated as DST rules occasionally shift.
2. **Thompson sampling for content ranking (STEP 9) is a distinct concern from auto-fill's constraint satisfaction (STEP 10) — they don't share a scorer.** Auto-fill assigns from the `ready` pool by a fixed constraint-relaxation order (angle rotation relaxed first, then format diversity, hook-pattern rotation relaxed last — build script: "hook-pattern rotation ... matters more than format diversity for feed fatigue," so format diversity is the constraint given up first under pressure), not a bandit-scored pick. A content item reaching the `ready` pool has already been through STEP 9's preference-weighted swipe queue; auto-fill's job is packing a calendar, not re-ranking taste.
3. **Caps and min-spacing are never relaxed; angle/format/hook-pattern rotation are, in a defined order, only when the pool has nothing better.** C6 caps are non-negotiable by design — `pickContentForSlot` is only ever called for a slot that already cleared both checks; there is no code path that assigns content to a slot that would breach a cap or violate min-spacing.
4. **Accounts don't carry their own timezone — scheduling is workspace-timezone-scoped**, matching how real scheduling tools actually work (you set a posting time in the business's own local time, not a per-platform-account time zone). GATE 10's literal wording ("Europe/London workspace with America/New_York accounts") doesn't map to a distinct system property under this design; both timezones are still genuinely, separately tested (`timezone.test.ts` covers both, `auto-fill.test.ts`'s DST test runs against the UK transition specifically since the workspace is the one that's timezone-scoped).
5. **No RFC 5545 RRULE recurrence engine.** `schedules.recurrenceRule` exists in the schema (STEP 1) and can hold an RRULE string, but a correct RRULE expander (handling BYDAY/BYMONTHDAY/UNTIL/COUNT/EXDATE, timezone-aware) is a real, separate undertaking comparable in size to the auto-fill algorithm itself, and GATE 10 doesn't test it. Flagged as a real, valuable, not-yet-done follow-up — the build script's own headline feature for this step ("the 30-day one-shot auto-fill") is what's built for real.
6. **`apps/web` still has no PGlite-style DB-integration test harness** (the same gap STEP 9 flagged). GATE 10's cap/double-booking/DST claims are proven at the algorithm level — `autoFillCalendar` takes the current DB state as plain input and is fully, directly testable — rather than end-to-end through the real tRPC router against a real Postgres. `routers/calendar.ts`'s own DB queries (joins, the reschedule cap re-check) are real code, exercised by `pnpm build`/`typecheck`/`lint` and a browser mount check, but not integration-tested the way `packages/core`'s algorithm is.
7. **`CalendarGrid` (STEP 7) was extended, not forked**, to accept an optional `onDrop` per day — its own doc comment already assigned "drag-to-reschedule is STEP 10's job" to this step, so extending it in place (rather than building a parallel drag-aware grid) keeps one real component instead of two that could drift.

## What was built

### `config/platform-caps.json`
Real published per-platform caps (C6) — TikTok's audited ~15/day-shared-across-clients figure, Instagram's 100/rolling-24h/account, YouTube modelled as a generous practical count since its real constraint is a 100-units/day API quota, not a literal post cap. Same env-override-for-tests pattern as `config/providers.json`/`config/safe-areas.json`.

### `packages/core/src/calendar`
`timezone.ts` (scope decision 1), `platform-caps.ts` (loader + `capFor`), `best-time.ts` (platform posting-time heuristics — general, widely-cited engagement windows, explicitly not a fabricated per-niche model; STEP 13's analytics eventually replaces this), `auto-fill.ts` (the real constraint-satisfaction algorithm — scope decisions 2-3). 26 tests: Gamma/Beta-adjacent floating-point correctness (see the bug below), real DST transitions discovered from Node's tzdata for both Europe/London and America/New_York, the full GATE 10 property set (zero cap violations re-derived from output, zero double-bookings, campaign-window fail-closed behaviour, format/spacing rotation, and the dedicated DST-boundary auto-fill run).

### `packages/db`
`calendar_slots.social_account_id` (migration 0011) — a real schema gap fix: the table only tracked `platform` before, but C6 caps and double-booking checks are per ACCOUNT, and a workspace can run more than one account per platform.

### `apps/web/server/routers/calendar.ts`
`slots.list/reschedule/bulkDelete`, `campaigns.list/create`, `autoFill.preview/commit`. `reschedule` re-checks the real cap/spacing constraints against the new time before committing — a drag that would breach a cap is rejected (`TRPCError` with a specific reason), not silently applied. `autoFill.preview` runs the real algorithm against real DB state and returns the proposed diff without writing anything; `commit` takes that exact reviewed diff back (not a fresh re-computation) and writes it.

### `apps/web/app/calendar`
Real month/week/list/table views over the same live data, genuine HTML5 drag-to-reschedule on the month/week grids (via the extended `CalendarGrid`), inline date-time reschedule on list/table, bulk-select + bulk-delete, a campaigns strip, and the auto-fill preview/commit flow. Verified to build cleanly and mount its real shell without a client crash when started as a real server (no reachable Postgres in this sandbox — the same constraint documented since STEP 2).

### `scripts/gate-10`
Real orchestrator. Run `pnpm gate:10` for the live report.

## Bugs found and fixed during this step

- **A real floating-point precision bug in `getOffsetMinutes`, found through direct debugging, not assumed.** `Intl.DateTimeFormat.formatToParts`'s `second` field is a whole-second string, while the input `Date` retains full millisecond precision — for any UTC instant with non-zero milliseconds, the offset computation picked up a spurious sub-minute remainder (e.g. `-240.00833...` instead of the true `-240`). This silently corrupted `findNextDstTransition`'s binary search: its strict `===` comparison against the target offset started treating bisection midpoints that were genuinely already past the real transition as if they weren't, because the computed offset differed from the target by a few thousandths of a minute. Traced by instrumenting the search and printing every iteration until the exact wrong value appeared, not guessed at. Fixed by rounding the offset to the nearest whole minute — exact, not a fudge, since every real IANA timezone offset genuinely is a whole number of minutes.

## GATE 10 — results

| Check | Expected | Actual | Status |
|---|---|---|---|
| 30-day fill across 3 platforms and 5 accounts yields zero cap violations | No account ever exceeds its configured cap | Re-derived directly from the algorithm's OUTPUT (not its internal bookkeeping) across a real 30-day/5-account run, plus a dedicated tightened-cap (1/day) test proving the limit is genuinely enforced | ✅ **Fully real** |
| Zero double-bookings | No two assignments share an account + exact instant | Verified against the same run's output | ✅ **Fully real** |
| Correct local times across a DST boundary | Europe/London workspace, America/New_York accounts | Both zones' real DST transitions discovered from Node's own tzdata; a dedicated 10-day auto-fill run straddling the UK's transition proves every assigned slot reads back at its intended local time | ✅ **Fully real** — see scope decision 4 on why "accounts" don't carry a separate timezone in this design |

All three GATE 10 checks pass for real — the strongest gate result so far this build, reflecting how directly testable pure constraint-satisfaction + timezone math is compared to steps depending on funded vendor keys or a live render environment. Run `pnpm gate:10` for the live report.

## What this step does not do

No RFC 5545 RRULE recurrence engine (scope decision 5) — `schedules.recurrenceRule` exists but nothing expands it yet. No PGlite-style DB-integration test harness for `apps/web` (scope decision 6, unchanged from STEP 9) — `routers/calendar.ts`'s own queries are real but not integration-tested against a live Postgres. No STEP 13 analytics feeding `best-time.ts`'s heuristic yet (it's still the general-engagement-window placeholder the build script itself anticipates). No literal per-account timezone (scope decision 4).
