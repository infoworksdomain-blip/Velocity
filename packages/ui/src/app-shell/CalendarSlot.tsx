import clsx from "clsx";
import type { ReactNode } from "react";
import { Text } from "../primitives/Text";
import styles from "./CalendarSlot.module.css";

export interface CalendarSlotProps {
  time: string;
  platform: string;
  thumbnail?: ReactNode;
  empty?: boolean;
}

/** A single scheduled-post cell within CalendarGrid. Presentational — drag-to-reschedule is STEP 10's job. */
export function CalendarSlot({ time, platform, thumbnail, empty }: CalendarSlotProps) {
  return (
    <div className={clsx(styles.slot, empty && styles.empty)}>
      {thumbnail && <div className={styles.thumb}>{thumbnail}</div>}
      <div className={styles.meta}>
        <Text variant="numeral" as="span">
          {time}
        </Text>
        <Text variant="label" as="span">
          {platform}
        </Text>
      </div>
    </div>
  );
}
