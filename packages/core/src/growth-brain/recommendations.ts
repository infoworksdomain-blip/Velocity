import type { GroupSummary } from "../analytics/aggregate.js";

/**
 * Weekly recommendations (STEP 14, build script's own literal example:
 * "curiosity-gap hooks outperform contrarian 2.4x on your account —
 * shift the mix"). Built directly on STEP 13's real aggregation output
 * — `citedMetrics` carries the actual GroupSummary rows a recommendation
 * is derived from, so GATE 14's "recommendations cite the data behind
 * them" is mechanically checkable (the numbers are structured data, not
 * just prose a reader has to trust).
 */

export interface Recommendation {
  dimensionLabel: string;
  winnerKey: string;
  loserKey: string;
  ratio: number;
  finding: string;
  action: string;
  citedMetrics: { winner: GroupSummary; loser: GroupSummary };
}

const MIN_NOTEWORTHY_RATIO = 1.2; // below this, the gap is real but not worth surfacing as a recommendation

export function generateRecommendations(groups: GroupSummary[], dimensionLabel: string, minSampleSize = 3): Recommendation[] {
  const qualifying = groups.filter((g) => g.count >= minSampleSize && g.avgEngagementRate > 0);
  if (qualifying.length < 2) return [];

  const sorted = [...qualifying].sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  const winner = sorted[0]!;
  const loser = sorted[sorted.length - 1]!;
  if (winner.key === loser.key) return [];

  const ratio = winner.avgEngagementRate / loser.avgEngagementRate;
  if (ratio < MIN_NOTEWORTHY_RATIO) return [];

  return [
    {
      dimensionLabel,
      winnerKey: winner.key,
      loserKey: loser.key,
      ratio,
      finding: `${winner.key} outperforms ${loser.key} ${ratio.toFixed(1)}x on ${dimensionLabel} (${(winner.avgEngagementRate * 100).toFixed(1)}% vs ${(loser.avgEngagementRate * 100).toFixed(1)}% avg engagement, across ${winner.count} and ${loser.count} posts respectively)`,
      action: `Shift the mix toward ${winner.key} and away from ${loser.key}`,
      citedMetrics: { winner, loser },
    },
  ];
}

/** Runs generateRecommendations across every dimension already aggregated (STEP 13's per-format/angle/persona/platform/hookPattern groupings) and ranks the results by ratio — the strongest, most specific findings first, matching the build script's "ranked, specific recommendations." */
export function rankRecommendationsAcrossDimensions(byDimension: Record<string, GroupSummary[]>, minSampleSize = 3): Recommendation[] {
  const all = Object.entries(byDimension).flatMap(([dimensionLabel, groups]) => generateRecommendations(groups, dimensionLabel, minSampleSize));
  return all.sort((a, b) => b.ratio - a.ratio);
}
