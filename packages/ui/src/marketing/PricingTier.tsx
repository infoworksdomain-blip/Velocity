import clsx from "clsx";
import { Text } from "../primitives/Text";
import styles from "./PricingTier.module.css";

export interface PricingTierProps {
  name: string;
  price: string;
  period?: string;
  features: string[];
  ctaLabel: string;
  onCta?: () => void;
  recommended?: boolean;
}

/** One of 4 tiers. The recommended tier is lifted with --sh-float, never a coloured border. */
export function PricingTier({ name, price, period = "/mo", features, ctaLabel, onCta, recommended }: PricingTierProps) {
  return (
    <div className={clsx(styles.tier, recommended && styles.recommended)}>
      {recommended && (
        <Text variant="label" as="span" className={styles.badge}>
          Most popular
        </Text>
      )}
      <Text variant="heading" as="h3">
        {name}
      </Text>
      <div className={styles.priceRow}>
        <span className={styles.price}>{price}</span>
        <Text variant="body" as="span" className={styles.period}>
          {period}
        </Text>
      </div>
      <ul className={styles.features}>
        {features.map((feature) => (
          <li key={feature}>
            <Text variant="body" as="span">
              {feature}
            </Text>
          </li>
        ))}
      </ul>
      <button type="button" className={clsx(styles.cta, recommended && styles.ctaRecommended)} onClick={onCta}>
        {ctaLabel}
      </button>
    </div>
  );
}
