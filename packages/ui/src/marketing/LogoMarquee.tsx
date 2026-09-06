import type { ReactNode } from "react";
import styles from "./LogoMarquee.module.css";

export interface LogoMarqueeProps {
  logos: Array<{ name: string; mark: ReactNode }>;
}

/** Infinite scroll, grayscale, pauses on hover and on prefers-reduced-motion. */
export function LogoMarquee({ logos }: LogoMarqueeProps) {
  const track = [...logos, ...logos];
  return (
    <div className={styles.marquee} role="list" aria-label="Customers">
      <div className={styles.track}>
        {track.map((logo, index) => (
          <span key={`${logo.name}-${index}`} className={styles.logo} role="listitem">
            {logo.mark}
          </span>
        ))}
      </div>
    </div>
  );
}
