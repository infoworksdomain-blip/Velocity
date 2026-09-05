---
description: Run every acceptance check for a STEP and report pass/fail honestly
argument-hint: <step-number>
---

Run every acceptance check listed under **GATE {{n}}** in `velocity-build-script.md` (and any additional acceptance tests recorded in `/docs/steps/STEP-{{n}}.md`).

Report a table with these columns: `check | expected | actual | pass`.

Rules:
- Do not fix anything in this run — this command only reports.
- Never mark a gate passed if any single check failed. If any row is `pass: false`, the gate as a whole is FAILED, stated explicitly at the top of the report.
- If a check cannot be run (missing infra, missing credentials, etc.), report it as `actual: could not run — <reason>` and `pass: false`, not as skipped or passed.
- End with a one-line verdict: `GATE {{n}}: PASSED` or `GATE {{n}}: FAILED — <n> of <total> checks failing`.
