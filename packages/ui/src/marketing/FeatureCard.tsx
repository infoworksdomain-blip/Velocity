import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./FeatureCard.module.css";

export interface FeatureCardProps {
  media: ReactNode;
  heading: string;
  copy: string;
}

/** Media panel on paper-2 above a heading and one line. */
export function FeatureCard({ media, heading, copy }: FeatureCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.media}>{media}</div>
      <Text variant="heading" as="h3" className={styles.heading}>
        {heading}
      </Text>
      <Text variant="body" as="p">
        {copy}
      </Text>
    </div>
  );
}
