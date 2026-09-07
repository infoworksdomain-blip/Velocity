import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Real-named-public-figure detection (STEP 15, GATE 15: "attempting to
 * generate a real named public figure is refused"). Same env-override-
 * for-tests config pattern as platform-caps.json/platform-media-
 * specs.json — the mechanism (a real, configurable, case-insensitive
 * whole-name matcher) is real; the seed list in config/public-
 * figures.json is a small, illustrative set, not a comprehensive
 * public-figure database (rule 5 — never invent a third-party data
 * source; a real production system needs a licensed name database or a
 * named-entity-recognition service, neither available here).
 */

export const PublicFiguresConfigSchema = z.object({
  version: z.literal(1),
  names: z.array(z.string().min(1)),
  note: z.string(),
});
export type PublicFiguresConfig = z.infer<typeof PublicFiguresConfigSchema>;

let cachedConfig: PublicFiguresConfig | null = null;

export function loadPublicFiguresConfig(absolutePath: string): PublicFiguresConfig {
  if (cachedConfig) return cachedConfig;
  const raw = JSON.parse(readFileSync(absolutePath, "utf-8"));
  cachedConfig = PublicFiguresConfigSchema.parse(raw);
  return cachedConfig;
}

export function resetPublicFiguresConfigForTests(): void {
  cachedConfig = null;
}

export interface PublicFigureMatch {
  matched: boolean;
  matchedName: string | null;
}

/**
 * Whole-name, case-insensitive, word-boundary matching — deliberately not
 * a bare substring test, so "Rihannastyle" (a made-up brand word
 * containing the name as a substring) doesn't false-positive. A genuinely
 * different person who happens to share a first name with someone on the
 * list (e.g. a persona named "Rihanna Cole") would still match here — a
 * real, honest limitation of name-only matching without a real named-
 * entity-recognition service; flagged in docs/steps/STEP-15.md rather
 * than silently overclaimed.
 */
export function detectPublicFigureReference(text: string, config: PublicFiguresConfig): PublicFigureMatch {
  const lower = text.toLowerCase();
  for (const name of config.names) {
    const pattern = new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) {
      return { matched: true, matchedName: name };
    }
  }
  return { matched: false, matchedName: null };
}
