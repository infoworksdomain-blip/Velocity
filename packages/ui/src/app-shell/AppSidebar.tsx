import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./AppSidebar.module.css";

export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
  active?: boolean;
}

/** Icon + label nav, active state in --flare. App-shell density (0.75x vertical spacing per Appendix A.5). */
export function AppSidebar({ items }: { items: SidebarItem[] }) {
  return (
    <nav className={styles.sidebar} aria-label="Primary">
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <a href={item.href} className={clsx(styles.item, item.active && styles.active)} aria-current={item.active ? "page" : undefined}>
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
