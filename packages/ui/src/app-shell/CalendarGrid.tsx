import type { ReactNode } from "react";
import clsx from "clsx";
import { Text } from "../primitives/Text";
import styles from "./CalendarGrid.module.css";

export interface CalendarDay {
  date: number;
  isToday?: boolean;
  isOutsideMonth?: boolean;
  slots: ReactNode[];
}

/** Month view. Week/list/table views and drag-to-reschedule are STEP 10's job — this renders the grid shape. */
export function CalendarGrid({ weekdayLabels, days }: { weekdayLabels: string[]; days: CalendarDay[] }) {
  return (
    <div className={styles.grid}>
      {weekdayLabels.map((label) => (
        <Text key={label} variant="label" as="div" className={styles.weekday}>
          {label}
        </Text>
      ))}
      {days.map((day, index) => (
        <div key={index} className={clsx(styles.day, day.isOutsideMonth && styles.outside)}>
          <Text variant="numeral" as="span" className={clsx(styles.date, day.isToday && styles.today)}>
            {day.date}
          </Text>
          <div className={styles.slots}>{day.slots}</div>
        </div>
      ))}
    </div>
  );
}
