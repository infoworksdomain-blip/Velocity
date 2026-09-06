import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon?: ReactNode;
  heading: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}

/** An invitation to act, never an apology. */
export function EmptyState({ icon, heading, body, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <div className={styles.state}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <Text variant="heading" as="h3">
        {heading}
      </Text>
      <Text variant="body" as="p" className={styles.body}>
        {body}
      </Text>
      {ctaLabel && (
        <button type="button" className={styles.cta} onClick={onCta}>
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
