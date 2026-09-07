/**
 * The 8B seam (build script 8B.5): STEP 8's compositions render nothing
 * here yet — the real `<HookOverlay>`/`<CaptionTrack>`/`<StickerText>`/
 * etc. components, driven by the TextPlan contract with the auto-fit,
 * legibility and safe-area algorithms, are STEP 8B's job. This component
 * exists so `VerticalVideo`/`Slideshow` have a stable slot to render into
 * once that lands, typed against a placeholder prop shape rather than
 * `any`.
 */
export interface TextLayerSlotProps {
  textOverlayRef: string | null;
}

export function TextLayerSlot({ textOverlayRef }: TextLayerSlotProps) {
  if (!textOverlayRef) return null;
  // Intentionally renders nothing visible yet — see the module comment.
  return null;
}
