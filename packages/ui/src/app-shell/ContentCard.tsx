import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./ContentCard.module.css";

export interface ContentCardProps {
  thumbnail: ReactNode;
  hook: string;
  state: string;
}

/** 9:16 thumbnail, hook text overlaid, state chip. */
export function ContentCard({ thumbnail, hook, state }: ContentCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.thumb}>{thumbnail}</div>
      <div className={styles.overlay}>
        <Text variant="body" as="p" className={styles.hook}>
          {hook}
        </Text>
      </div>
      <Text variant="label" as="span" className={styles.state}>
        {state}
      </Text>
    </article>
  );
}
