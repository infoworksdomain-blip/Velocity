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

/** One real historical publish's outcome — already converted to workspace-local wall-clock time by the caller (this module does no timezone math itself; see calendar/timezone.ts for that). */
export interface HistoricalPublishOutcome {
  platform: string;
  localDate: string; // YYYY-MM-DD — used only to count DISTINCT days of coverage, not for bucketing
  localHour: number; // 0-23
  engagementRate: number;
}

const MIN_DISTINCT_DAYS = 30; // the build script's own literal threshold: "once STEP 13 has ~30 days"
const TOP_N_HOURS = 3; // matches DEFAULT_BEST_TIMES' typical size (2-3 slots per platform)

/**
 * The real "replaced by the workspace's own data once STEP 13 has ~30
 * days" promise auto-fill.ts's own doc comment already made. Buckets
 * real publish outcomes by local hour, ranks by mean engagement rate,
 * and returns the top N hours as "HH:00" strings — but only once the
 * platform has genuinely accumulated `minDistinctDays` (default 30) of
 * DIFFERENT calendar days' worth of data; returns `null` before that
 * point rather than fabricating a "workspace-specific" ranking from too
 * little evidence, so the caller can fall back to `bestTimesFor`'s
 * general heuristic honestly.
 */
export function computeWorkspaceBestTimes(history: HistoricalPublishOutcome[], platform: string, minDistinctDays = MIN_DISTINCT_DAYS, topN = TOP_N_HOURS): string[] | null {
  const platformHistory = history.filter((h) => h.platform === platform);
  const distinctDays = new Set(platformHistory.map((h) => h.localDate));
  if (distinctDays.size < minDistinctDays) return null;

  const byHour = new Map<number, number[]>();
  for (const outcome of platformHistory) {
    const rates = byHour.get(outcome.localHour) ?? [];
    rates.push(outcome.engagementRate);
    byHour.set(outcome.localHour, rates);
  }

  const hourAverages = [...byHour.entries()].map(([hour, rates]) => ({ hour, avgRate: rates.reduce((sum, r) => sum + r, 0) / rates.length }));
  hourAverages.sort((a, b) => b.avgRate - a.avgRate);

  return hourAverages.slice(0, topN).map((h) => `${String(h.hour).padStart(2, "0")}:00`);
}
