import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { BoundingBox } from "@velocity/text-engine";

export interface CaptionWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface CaptionTrackProps {
  words: CaptionWord[];
  wordsPerGroup: number;
  box: BoundingBox;
  fontFamily: string;
}

function groupWords(words: CaptionWord[], size: number): CaptionWord[][] {
  const groups: CaptionWord[][] = [];
  for (let i = 0; i < words.length; i += size) groups.push(words.slice(i, i + size));
  return groups;
}

/**
 * Word-level burned captions with karaoke highlighting, from WhisperX
 * alignment word timings (build script 8B.5) — `align`'s real output
 * (apps/worker's align.ts activity), threaded through once a real
 * transcription provider produces real timings (STEP 8's `align` activity
 * is real code, pending a funded transcription key — see STEP-08.md).
 */
export function CaptionTrack({ words, wordsPerGroup, box, fontFamily }: CaptionTrackProps) {
  const { fps } = useVideoConfig();
  const groups = groupWords(words, wordsPerGroup);

  return (
    <AbsoluteFill>
      {groups.map((group, i) => {
        const startMs = group[0]?.startMs ?? 0;
        const endMs = group[group.length - 1]?.endMs ?? startMs;
        const fromFrame = Math.round((startMs / 1000) * fps);
        const durationInFrames = Math.max(1, Math.round(((endMs - startMs) / 1000) * fps));
        return (
          <Sequence key={i} from={fromFrame} durationInFrames={durationInFrames}>
            <CaptionGroup group={group} box={box} fontFamily={fontFamily} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

function CaptionGroup({ group, box, fontFamily }: { group: CaptionWord[]; box: BoundingBox; fontFamily: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (group[0]?.startMs ?? 0) + (frame / fps) * 1000;

  return (
    <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "center", paddingBottom: "22%" }}>
      <div style={{ maxWidth: box.right - box.left, textAlign: "center", fontFamily, fontSize: 44, fontWeight: 700 }}>
        {group.map((w, i) => {
          const isSpoken = nowMs >= w.startMs;
          return (
            <span key={i} style={{ color: isSpoken ? "#FF4D12" : "#FFFFFF", textShadow: "0 1px 3px rgba(0,0,0,0.7)", marginRight: "0.3em" }}>
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
