import { useState } from "react";
import clsx from "clsx";
import { Text } from "../primitives/Text";
import styles from "./FAQAccordion.module.css";

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export function FAQAccordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className={styles.accordion}>
      {items.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div key={item.id} className={styles.item}>
            <button
              type="button"
              className={styles.trigger}
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : item.id)}
            >
              <Text variant="heading" as="span" className={styles.question}>
                {item.question}
              </Text>
              <span className={clsx(styles.icon, isOpen && styles.iconOpen)} aria-hidden="true">
                +
              </span>
            </button>
            {isOpen && (
              <Text variant="body" as="p" className={styles.answer}>
                {item.answer}
              </Text>
            )}
          </div>
        );
      })}
    </div>
  );
}
