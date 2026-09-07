import type { ReactNode } from "react";
import styles from "./VelocityDeck.module.css";

export interface VelocityDeckProps {
  /** Cards in stack order, topmost first. Only the top ~3 render (perf — STEP 9's prefetch/preload requirements). */
  cards: ReactNode[];
}

/** Stacks VelocityCards with the next card scaling from 0.94 to 1.0 as the top card leaves, per Appendix A.4. */
export function VelocityDeck({ cards }: VelocityDeckProps) {
  const visible = cards.slice(0, 3);
  return (
    <div className={styles.deck}>
      {visible
        .map((card, index) => (
          <div key={index} className={styles.slot} style={{ "--depth": index } as React.CSSProperties}>
            {card}
          </div>
        ))
        .reverse()}
    </div>
  );
}
