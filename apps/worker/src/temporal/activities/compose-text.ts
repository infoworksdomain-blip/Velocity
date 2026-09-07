/**
 * The text-overlay layer (STEP 8B's job — hook/caption/CTA rendering with
 * auto-fit, legibility, and safe-area logic). This activity's signature is
 * final; its body is a documented seam until STEP 8B lands. Returns
 * `textEngineImplemented: false` in its output (not just a code comment)
 * so 8B's landing is detectable in render_steps.output data, not only in
 * source code.
 */
export interface ComposeTextResult {
  textOverlayRef: string | null;
  textEngineImplemented: false;
}

export async function composeText(textPlanId: string | null): Promise<ComposeTextResult> {
  return { textOverlayRef: textPlanId ? `pending-8b:${textPlanId}` : null, textEngineImplemented: false };
}
