import clsx from "clsx";
import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./AccountChip.module.css";

export type AccountHealth = "healthy" | "warning" | "error";

export interface AccountChipProps {
  avatar: ReactNode;
  platformMark: ReactNode;
  handle: string;
  health: AccountHealth;
}

/** Avatar, platform mark, health dot. */
export function AccountChip({ avatar, platformMark, handle, health }: AccountChipProps) {
  return (
    <div className={styles.chip}>
      <div className={styles.avatarWrap}>
        <div className={styles.avatar}>{avatar}</div>
        <span className={styles.platform}>{platformMark}</span>
      </div>
      <Text variant="body" as="span" className={styles.handle}>
        {handle}
      </Text>
      <span className={clsx(styles.dot, styles[health])} aria-label={`Account status: ${health}`} />
    </div>
  );
}
