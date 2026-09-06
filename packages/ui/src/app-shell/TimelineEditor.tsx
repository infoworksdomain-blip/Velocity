import { Text } from "../primitives/Text";
import styles from "./TimelineEditor.module.css";

export interface TimelineMarker {
  id: string;
  label: string;
  startPct: number;
  widthPct: number;
}

export interface TimelineEditorProps {
  durationLabel: string;
  markers: TimelineMarker[];
}

/**
 * TextPlan overlay timing (STEP 8B.7). Presentational — actual drag-to-
 * retime interaction and the Remotion Player preview are STEP 8B.7's job;
 * this renders the timeline shape from a list of {start, width} markers.
 */
export function TimelineEditor({ durationLabel, markers }: TimelineEditorProps) {
  return (
    <div className={styles.editor}>
      <div className={styles.track}>
        {markers.map((marker) => (
          <div
            key={marker.id}
            className={styles.marker}
            style={{ left: `${marker.startPct}%`, width: `${marker.widthPct}%` }}
          >
            <Text variant="label" as="span" className={styles.markerLabel}>
              {marker.label}
            </Text>
          </div>
        ))}
      </div>
      <Text variant="numeral" as="span" className={styles.duration}>
        {durationLabel}
      </Text>
    </div>
  );
}
