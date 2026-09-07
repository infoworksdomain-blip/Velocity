/**
 * Platform posting-time heuristics (STEP 10: "rank by a best-time model
 * (platform heuristics per niche initially, replaced by the workspace's
 * own data once STEP 13 has ~30 days)"). These are general, widely-cited
 * social-media-marketing engagement windows, NOT a fabricated or
 * per-niche-tuned model — a real per-niche/per-workspace model needs
 * STEP 13's analytics ingestion (~30 days of the workspace's own posting
 * history), which doesn't exist yet. Local wall-clock times, "HH:MM".
 */
export const DEFAULT_BEST_TIMES: Record<string, string[]> = {
  tiktok: ["09:00", "12:00", "19:00"],
  instagram: ["11:00", "13:00", "19:00"],
  youtube: ["14:00", "17:00"],
};

export function bestTimesFor(platform: string): string[] {
  return DEFAULT_BEST_TIMES[platform] ?? ["12:00"];
}
