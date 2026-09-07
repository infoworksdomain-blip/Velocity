import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./VelocityCard.module.css";

export interface VelocityCardProps {
  media: ReactNode;
  hook: string;
  angle: string;
  /** Drag offset in px, drives the spring/rotation physics — STEP 9 owns the actual gesture handling; this component only renders the visual result of a given offset. */
  dragX?: number;
}

/**
 * Full-bleed 9:16, hook rendered on the preview. Presentational only — the
 * real spring-based drag physics (±12° rotation, colour wash at commit
 * threshold) is STEP 9's job; this component exposes `dragX` as the single
 * input that visual behavior would drive.
 */
export function VelocityCard({ media, hook, angle, dragX = 0 }: VelocityCardProps) {
  const rotation = Math.max(-12, Math.min(12, dragX / 10));
  return (
    <div className={styles.card} style={{ transform: `translateX(${dragX}px) rotate(${rotation}deg)` }}>
      <div className={styles.media}>{media}</div>
      <div className={styles.overlay}>
        <Text variant="label" as="span" className={styles.angle}>
          {angle}
        </Text>
        <Text variant="body-lg" as="p" className={styles.hook}>
          {hook}
        </Text>
      </div>
    </div>
  );
}
