import { Text } from "../primitives/Text";
import styles from "./StatCard.module.css";

export interface StatCardProps {
  label: string;
  value: string;
  trend?: { direction: "up" | "down"; label: string };
}

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className={styles.card}>
      <Text variant="label" as="p">
        {label}
      </Text>
      <Text variant="display-2" as="p" className={styles.value}>
        {value}
      </Text>
      {trend && (
        <Text variant="numeral" as="p" className={styles.trend}>
          {trend.direction === "up" ? "↑" : "↓"} {trend.label}
        </Text>
      )}
    </div>
  );
}
