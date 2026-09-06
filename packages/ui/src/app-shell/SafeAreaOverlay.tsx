import styles from "./SafeAreaOverlay.module.css";

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SafeAreaOverlayProps {
  /** Insets in px against the 1080x1920 reference frame (STEP 8B.5's config/safe-areas.json) — not hardcoded here, passed in by the caller. */
  insets: SafeAreaInsets;
  platformLabel: string;
  visible?: boolean;
}

const REFERENCE_WIDTH = 1080;
const REFERENCE_HEIGHT = 1920;

/** Toggleable platform safe-area guide, overlaid on a BlitzCard/ContentCard preview. */
export function SafeAreaOverlay({ insets, platformLabel, visible = true }: SafeAreaOverlayProps) {
  if (!visible) return null;

  const pct = {
    top: (insets.top / REFERENCE_HEIGHT) * 100,
    bottom: (insets.bottom / REFERENCE_HEIGHT) * 100,
    left: (insets.left / REFERENCE_WIDTH) * 100,
    right: (insets.right / REFERENCE_WIDTH) * 100,
  };

  return (
    <div className={styles.overlay} aria-hidden="true">
      <div
        className={styles.guide}
        style={{ top: `${pct.top}%`, bottom: `${pct.bottom}%`, left: `${pct.left}%`, right: `${pct.right}%` }}
      />
      <span className={styles.label}>{platformLabel} safe area</span>
    </div>
  );
}
