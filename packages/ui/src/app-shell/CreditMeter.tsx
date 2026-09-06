import { Text } from "../primitives/Text";
import styles from "./CreditMeter.module.css";

export interface CreditMeterProps {
  balance: number;
  limit: number;
}

export function CreditMeter({ balance, limit }: CreditMeterProps) {
  const pct = limit > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0;
  const low = pct < 15;

  return (
    <div className={styles.meter}>
      <div className={styles.header}>
        <Text variant="label" as="span">
          Credits
        </Text>
        <Text variant="numeral" as="span">
          {balance.toLocaleString()} / {limit.toLocaleString()}
        </Text>
      </div>
      <div className={styles.track} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.fill} data-low={low} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
