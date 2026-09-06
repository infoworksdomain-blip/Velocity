import type { ReactNode } from "react";
import styles from "./DeviceFrame.module.css";

export interface DeviceFrameStatChip {
  label: string;
  value: string;
}

export interface DeviceFrameProps {
  children: ReactNode;
  statChips?: DeviceFrameStatChip[];
}

/** 9:16 media frame with the reference design's signature glow, plus optional floating stat chips at the edges. */
export function DeviceFrame({ children, statChips = [] }: DeviceFrameProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.frame}>{children}</div>
      {statChips.map((chip, index) => (
        <div key={chip.label} className={styles.chip} style={{ "--chip-index": index } as React.CSSProperties}>
          <span className={styles.chipValue}>{chip.value}</span>
          <span className={styles.chipLabel}>{chip.label}</span>
        </div>
      ))}
    </div>
  );
}
