import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./ShowcaseGrid.module.css";

export interface ShowcaseItem {
  id: string;
  avatar: ReactNode;
  name: string;
  type: string;
  metric: string;
  media: ReactNode;
}

/** 2-col grid of 9:16 cards with an app avatar, name, type tag and metric row. */
export function ShowcaseGrid({ items }: { items: ShowcaseItem[] }) {
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <article key={item.id} className={styles.card}>
          <div className={styles.media}>{item.media}</div>
          <div className={styles.meta}>
            <div className={styles.avatar}>{item.avatar}</div>
            <div className={styles.info}>
              <Text variant="body" as="span" className={styles.name}>
                {item.name}
              </Text>
              <Text variant="label" as="span">
                {item.type}
              </Text>
            </div>
            <Text variant="numeral" as="span" className={styles.metric}>
              {item.metric}
            </Text>
          </div>
        </article>
      ))}
    </div>
  );
}
