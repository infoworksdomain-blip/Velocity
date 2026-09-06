import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./SpotlightBlock.module.css";

export interface SpotlightBlockProps {
  label: string;
  heading: ReactNode;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
  quote?: { text: string; source: string };
  media?: ReactNode;
}

/** Label + display-2 + paragraph + CTA + quote, asymmetric two-column. */
export function SpotlightBlock({ label, heading, body, ctaLabel, onCta, quote, media }: SpotlightBlockProps) {
  return (
    <div className={styles.block}>
      <div className={styles.copy}>
        <Text variant="label" as="p">
          {label}
        </Text>
        <Text variant="display-2" as="h2" className={styles.heading}>
          {heading}
        </Text>
        <Text variant="body-lg" as="p" className={styles.body}>
          {body}
        </Text>
        {ctaLabel && (
          <button type="button" className={styles.cta} onClick={onCta}>
            {ctaLabel}
          </button>
        )}
        {quote && (
          <blockquote className={styles.quote}>
            <p>&ldquo;{quote.text}&rdquo;</p>
            <cite>{quote.source}</cite>
          </blockquote>
        )}
      </div>
      {media && <div className={styles.media}>{media}</div>}
    </div>
  );
}
