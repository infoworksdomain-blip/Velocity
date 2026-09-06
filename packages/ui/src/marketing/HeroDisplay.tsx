import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./HeroDisplay.module.css";

export interface HeroDisplayProps {
  /** Use <em> inside for the italic-cut emphasis words — the reference design's signature move. */
  headline: ReactNode;
  subhead: string;
  primaryCtaLabel: string;
  onPrimaryCta?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCta?: () => void;
}

export function HeroDisplay({
  headline,
  subhead,
  primaryCtaLabel,
  onPrimaryCta,
  secondaryCtaLabel,
  onSecondaryCta,
}: HeroDisplayProps) {
  return (
    <div className={styles.hero}>
      <Text variant="display-1" as="h1" className={styles.headline}>
        {headline}
      </Text>
      <Text variant="body-lg" as="p" className={styles.subhead}>
        {subhead}
      </Text>
      <div className={styles.ctaRow}>
        <button type="button" className={styles.primary} onClick={onPrimaryCta}>
          {primaryCtaLabel}
        </button>
        {secondaryCtaLabel && (
          <button type="button" className={styles.secondary} onClick={onSecondaryCta}>
            {secondaryCtaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
