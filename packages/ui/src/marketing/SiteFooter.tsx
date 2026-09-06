import { Text } from "../primitives/Text";
import styles from "./SiteFooter.module.css";

export interface FooterColumn {
  heading: string;
  links: Array<{ label: string; href: string }>;
}

export interface SiteFooterProps {
  wordmark: string;
  columns: FooterColumn[];
}

/** Four link columns, oversized wordmark, ember treatment. */
export function SiteFooter({ wordmark, columns }: SiteFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.columns}>
        {columns.map((column) => (
          <div key={column.heading}>
            <Text variant="label" as="p">
              {column.heading}
            </Text>
            <ul className={styles.links}>
              {column.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={styles.link}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={styles.wordmark}>{wordmark}</div>
    </footer>
  );
}
