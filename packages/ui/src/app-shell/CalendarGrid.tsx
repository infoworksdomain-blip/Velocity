import type { ReactNode } from "react";
import clsx from "clsx";
import { Text } from "../primitives/Text";
import styles from "./CalendarGrid.module.css";

export interface CalendarDay {
  date: number;
  isToday?: boolean;
  isOutsideMonth?: boolean;
  slots: ReactNode[];
  /** STEP 10: fires when a dragged slot is dropped on this day cell — the caller (apps/web/app/calendar) decides what a drop means (reschedule to this date, keeping time-of-day). Optional so week/month usage without drag-to-reschedule still works. */
  onDrop?: () => void;
}

/** Month/week view (STEP 10 uses this for both, passing 7 or 42 days). Drag-to-reschedule: each day cell is a real drop target when `onDrop` is provided; the drag SOURCE (making a slot draggable) is the caller's job, since only the caller knows what a specific slot node represents. */
export function CalendarGrid({ weekdayLabels, days }: { weekdayLabels: string[]; days: CalendarDay[] }) {
  return (
    <div className={styles.grid}>
      {weekdayLabels.map((label) => (
        <Text key={label} variant="label" as="div" className={styles.weekday}>
          {label}
        </Text>
      ))}
      {days.map((day, index) => (
        <div
          key={index}
          className={clsx(styles.day, day.isOutsideMonth && styles.outside)}
          onDragOver={day.onDrop ? (e) => e.preventDefault() : undefined}
          onDrop={day.onDrop}
        >
          <Text variant="numeral" as="span" className={clsx(styles.date, day.isToday && styles.today)}>
            {day.date}
          </Text>
          <div className={styles.slots}>{day.slots}</div>
        </div>
      ))}
    </div>
  );
}
