import clsx from "clsx";
import type { ElementType, ReactNode } from "react";
import styles from "./Text.module.css";

export type TextVariant = "display-1" | "display-2" | "heading" | "body-lg" | "body" | "label" | "numeral";

const DEFAULT_TAG: Record<TextVariant, ElementType> = {
  "display-1": "h1",
  "display-2": "h2",
  heading: "h3",
  "body-lg": "p",
  body: "p",
  label: "span",
  numeral: "span",
};

export interface TextProps {
  variant: TextVariant;
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

/**
 * The one place Appendix A's type scale is applied. Every component reads
 * a variant here rather than sizing text itself — this is what the
 * token-audit script checks for (no raw font-size outside packages/ui).
 */
export function Text({ variant, as, className, children }: TextProps) {
  const Tag = as ?? DEFAULT_TAG[variant];
  return <Tag className={clsx(styles[variant], className)}>{children}</Tag>;
}
