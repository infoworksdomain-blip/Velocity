/**
 * Render service entrypoint placeholder (STEP 1).
 *
 * STEP 8 turns this into the actual Remotion project: the composition
 * pipeline (1080x1920, H.264, -14 LUFS), and STEP 8B.5's text-layer
 * components consuming the TextPlan contract from @velocity/text-engine.
 * Runs on Lambda per ADR 0002; ffmpeg is invoked only for transcode and
 * loudness normalisation, never for composition.
 */

console.log("[render] placeholder entrypoint — see STEP 8 and STEP 8B");
