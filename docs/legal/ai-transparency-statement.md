# Velocity AI Transparency Statement (EU AI Act Art. 50)

*A real statement reflecting this build's own actual, implemented disclosure mechanisms — not aspirational. Every claim below cites the real code that makes it true.*

## What is AI-generated

Every video, image, and text overlay Velocity produces is AI-generated. This is not optional or configurable — `renders.ai_generated` defaults to `true` at the schema level (STEP 2), and provenance is recorded for every render (`provenance` module, STEP 8) before it can ever publish.

## How you'll know

1. **In our own product**: every AI-generated piece of content and every AI Assistant/Agent message carries a visible "AI ASSISTANT" or equivalent badge in the UI — the real Art. 50(1) "point of interaction" disclosure (STEP 14).
2. **On the platform where it's published**: we set each platform's own native AI-content disclosure field at publish time — TikTok's `is_ai_generated`-equivalent flag, Instagram's `is_ai_generated` container parameter, YouTube's `containsSyntheticMedia` field (STEP 12). We never omit or falsify these fields.
3. **In the file itself**: a C2PA provenance manifest is attached where a real, funded, production-grade signing certificate is provisioned (a real, honestly-flagged infrastructure dependency for a specific production deployment, not built as a demo capability in this codebase — see docs/steps/STEP-08.md).

## What is not AI-generated

Your own brand assets, product facts, and any human-supplied proof points are treated as your own content, not AI output, even though they're incorporated into an AI-generated piece — we never claim your factual brand information is "AI-generated."

## Human oversight

No AI-generated content publishes without a recorded human approval event (C7) — the approval itself is either your explicit "swipe right" gesture or a direct publish action, both of which write a permanent, auditable record.

## Regulated claims and public figures

Our AI persona/content generation policy hard-blocks generating content that impersonates a real, named public figure, and requires an approved review before publishing certain regulated claims (health, financial, etc.) — a real, enforced policy engine (STEP 15), not just a stated rule.
