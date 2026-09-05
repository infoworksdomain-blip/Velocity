---
description: Produce the implementation plan for a build-script STEP
argument-hint: <step-number>
---

Read `/docs/steps/STEP-{{n}}.md`. Where `{{n}}` is the zero-padded step number given as an argument (e.g. `01`).

Produce the implementation plan:
1. Restate the step's goal and its GATE checks in your own words, from `velocity-build-script.md`.
2. List every file you intend to create or modify, grouped by package/app.
3. List the acceptance tests you will write, mapped one-to-one to the GATE checks — every GATE check must have a corresponding test.
4. Call out any third-party API contract you are not 100% certain of; propose either stopping to ask or building against a recorded fixture flagged unverified.
5. Call out any place this step's needs conflict with a decision made in an earlier ADR, and say so before implementing it.

Do not write code in this pass. Stop after the plan for approval.
