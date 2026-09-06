import styles from "./AnnouncementPill.module.css";

export interface AnnouncementPillProps {
  badge: string;
  text: string;
  href?: string;
}

/** Small badge + sentence, links into the app. */
export function AnnouncementPill({ badge, text, href = "#" }: AnnouncementPillProps) {
  return (
    <a className={styles.pill} href={href}>
      <span className={styles.badge}>{badge}</span>
      <span className={styles.text}>{text}</span>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
    </a>
  );
}
