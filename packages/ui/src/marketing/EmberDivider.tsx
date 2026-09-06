import styles from "./EmberDivider.module.css";

/** Full-bleed radial arc, ember core into flare edge — the only saturated element on the page besides the accent. */
export function EmberDivider() {
  return <div className={styles.divider} role="presentation" />;
}
