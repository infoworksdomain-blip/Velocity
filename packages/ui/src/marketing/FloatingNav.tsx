import type { ReactNode } from "react";
import styles from "./FloatingNav.module.css";

export interface FloatingNavLink {
  label: string;
  href: string;
}

export interface FloatingNavProps {
  logo: ReactNode;
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  links?: FloatingNavLink[];
}

/** Sticky centred pill, logo left, single CTA right, collapses under 768px. */
export function FloatingNav({ logo, ctaLabel, ctaHref, onCtaClick, links = [] }: FloatingNavProps) {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <div className={styles.logo}>{logo}</div>
      <ul className={styles.links}>
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} className={styles.link}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <a href={ctaHref ?? "#"} className={styles.cta} onClick={onCtaClick}>
        {ctaLabel}
      </a>
    </nav>
  );
}
