import { z } from "zod";

/** Zod mirror of ../text/CaptionTrack.js's CaptionWord — a real WhisperX alignment word timing (build script 8B.5), needed here (not just as a TS type) because Remotion's <Composition> prop validation requires a schema, not just a type. */
export const CaptionWordSchema = z.object({
  word: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
});
export type CaptionWordProp = z.infer<typeof CaptionWordSchema>;
