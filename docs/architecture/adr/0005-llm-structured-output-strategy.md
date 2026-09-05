# ADR 0005 — One schema drives both the Anthropic and OpenAI text adapters

## Status
Accepted

## Context
The text-engine (STEP 8B) must produce a `TextPlan` — a structured JSON object, not prose — from either Anthropic or OpenAI, with OpenAI as the configured fallback (ADR 0004's routing policy). Anthropic's Messages API and OpenAI's Responses API expose structured output through different mechanisms: Anthropic via a forced tool call (`tool_choice: { type: 'tool', name: '...' }`) whose `input_schema` is the target shape, OpenAI via a strict JSON-schema response format. If the two adapters are handed hand-written, independently-maintained schema definitions, they will drift — a field added for one provider silently missing from the other — and that drift surfaces as a runtime shape mismatch precisely when the fallback path is needed, i.e. during an Anthropic outage, which is the worst possible time to discover it.

## Decision
**One JSON Schema object** (the `TextPlan` contract, STEP 8B.2) is the single source of truth, defined once in `packages/text-engine`. A shared adapter layer converts that one definition into whatever shape each provider's API expects:

- **Anthropic adapter:** wraps the schema as a single tool's `input_schema`, forces `tool_choice` to that tool, and reads the result from the `tool_use` block.
- **OpenAI adapter:** passes the same schema object as a strict JSON-schema `response_format`.

Neither adapter is permitted to maintain its own copy of the schema or a hand-adjusted variant "for that provider's quirks" — provider-specific quirks are handled in the adapter's request/response translation code, never by forking the schema.

GATE 8B's mechanical proof of this: a test asserts structural equality between what both adapters produce from the same input, confirming the schema didn't silently diverge.

## Consequences
- Schema changes happen in exactly one place and are validated against both providers by the same test, rather than requiring someone to remember to update two definitions.
- The validation/repair loop (STEP 8B.4 — Zod schema check → repair call → template fallback) is written once against the shared schema and applies identically regardless of which provider produced the raw output.
- This pattern is the text-domain instance of ADR 0004's general provider-abstraction principle: a fixed contract at the boundary, vendor-specific translation behind it, nowhere in business logic that assumes "the current default provider's" specific output shape.
