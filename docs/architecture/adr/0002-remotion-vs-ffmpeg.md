# ADR 0002 — Remotion as compositor of record, ffmpeg scoped to transcode/loudness

## Status
Accepted

## Context
Every `ContentItem` needs a final composed video: shot footage, a separate on-screen text layer driven by `TextPlan` (STEP 8B), captions burned in from WhisperX alignment, and platform-correct framing (1080×1920, safe areas). There are two broad ways to build this: compose frames programmatically with a tool that understands layout and animation (Remotion — React components rendered to video), or build the entire composition as an ffmpeg filter graph.

ffmpeg filter graphs can do this, but expressing auto-fit text sizing, phrase-boundary line breaks, per-role style presets, and timed overlay entrance/exit animations as filter-graph string concatenation is fragile to write, fragile to test, and effectively unreviewable in a PR diff. Remotion expresses the same composition as typed React components, which is exactly what STEP 8B.5's component inventory (`<HookOverlay>`, `<CaptionTrack>`, `<StickerText>`, `<MemeBar>`, `<LowerThird>`, `<CTAEndCard>`, `<SlideText>`) assumes.

## Decision
**Remotion is the compositor of record** for everything involving layout, text, and animation — it runs on Lambda for parallel rendering. **ffmpeg is scoped to transcode and loudness normalisation only** (output container/codec conversion, −14 LUFS normalisation) and never used for composition.

The auto-fit algorithm (binary-search font size, measure with canvas `measureText`, break on phrase boundaries) and the legibility/contrast logic (sample frame luminance, switch stroke treatment) both live in Remotion components precisely because they need programmatic access to text measurement and frame content that a filter graph cannot easily provide.

**Fallback story:** if Remotion/Lambda has an outage, render jobs queue in Temporal (durable — see ADR 0001) rather than falling back to an ffmpeg-composed degraded path. A partial ffmpeg-only fallback would silently violate the safe-area and auto-fit guarantees GATE 8B checks for, so degrade to "wait," not to "compose worse."

## Consequences
- Remotion/Lambda cold-start and concurrency limits become a first-class capacity concern for STEP 21's performance targets (500 concurrent renders, p95 <5min for a 20s video).
- The text-layer/video-layer separation this ADR enables is what makes STEP 8B.6's economics work: a hook-only change re-enters the Remotion composition at the text layer and reuses the cached video track, rather than re-running the full pipeline.
- ffmpeg remains a dependency (hence it's provisioned in the devcontainer), but its surface area is deliberately small and auditable.
