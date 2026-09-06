import { Text } from "../primitives/Text";
import styles from "./ProofBadges.module.css";

export interface ProofBadgesProps {
  badges: Array<{ value: string; label: string }>;
}

/** A row of stat-shaped proof points below the hero (e.g. "50,000+ businesses"). */
export function ProofBadges({ badges }: ProofBadgesProps) {
  return (
    <dl className={styles.row}>
      {badges.map((badge) => (
        <div key={badge.label} className={styles.badge}>
          <dt className={styles.value}>{badge.value}</dt>
          <dd className={styles.label}>
            <Text variant="label" as="span">
              {badge.label}
            </Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}
