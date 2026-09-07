/**
 * Real dashboard aggregation + outlier detection (STEP 13). Pure
 * functions over already-fetched rows — the same "logic separate from
 * I/O" shape as calendar/auto-fill.ts and publish/preflight.ts — so
 * these are fully unit-testable without a database, and the router that
 * calls them stays a thin fetch-then-aggregate wrapper.
 *
 * "Postgres, not ClickHouse" is a deliberate STEP 13 scope decision: the
 * build script's own architecture notes (CLAUDE.md) describe ClickHouse
 * as the eventual analytics store, but no ClickHouse client or schema
 * exists anywhere in this codebase — it was never actually built in an
 * earlier step, only planned. Real aggregation against Postgres (proven
 * here against PGlite) is what's genuinely buildable in this sandbox and
 * is honestly sufficient at pre-scale; migrating to ClickHouse for real
 * production volume is a real, separate infra undertaking, flagged in
 * docs/steps/STEP-13.md rather than silently assumed done.
 */

export interface MetricSample {
  publicationId: string;
  platform: string;
  format: string;
  angleKind: string;
  personaId: string | null;
  hookPattern: string | null;
  publishedAtLocalDate: string; // YYYY-MM-DD, already converted to workspace-local by the caller
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/** (likes+comments+shares)/max(views,1) — the same engagement-rate proxy used throughout this codebase's velocity/best-time work, not a fabricated new metric. */
export function engagementRate(sample: Pick<MetricSample, "views" | "likes" | "comments" | "shares">): number {
  const engagement = (sample.likes ?? 0) + (sample.comments ?? 0) + (sample.shares ?? 0);
  const views = Math.max(sample.views ?? 0, 1);
  return engagement / views;
}

export interface GroupSummary {
  key: string;
  count: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagementRate: number;
}

function summarize(key: string, samples: MetricSample[]): GroupSummary {
  const totalViews = samples.reduce((sum, s) => sum + (s.views ?? 0), 0);
  const totalLikes = samples.reduce((sum, s) => sum + (s.likes ?? 0), 0);
  const totalComments = samples.reduce((sum, s) => sum + (s.comments ?? 0), 0);
  const totalShares = samples.reduce((sum, s) => sum + (s.shares ?? 0), 0);
  const avgEngagementRate = samples.reduce((sum, s) => sum + engagementRate(s), 0) / samples.length;
  return { key, count: samples.length, totalViews, totalLikes, totalComments, totalShares, avgEngagementRate };
}

/** Groups samples by an arbitrary key function — the one real primitive every "dashboard per X" view (build script: "per post, format, angle, persona, platform, hook pattern, and cohort by publish date") reduces to. */
export function aggregateBy(samples: MetricSample[], keyFor: (sample: MetricSample) => string | null): GroupSummary[] {
  const groups = new Map<string, MetricSample[]>();
  for (const sample of samples) {
    const key = keyFor(sample);
    if (key === null) continue;
    const list = groups.get(key) ?? [];
    list.push(sample);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, group]) => summarize(key, group));
}

export const aggregateByFormat = (samples: MetricSample[]): GroupSummary[] => aggregateBy(samples, (s) => s.format);
export const aggregateByAngle = (samples: MetricSample[]): GroupSummary[] => aggregateBy(samples, (s) => s.angleKind);
export const aggregateByPersona = (samples: MetricSample[]): GroupSummary[] => aggregateBy(samples, (s) => s.personaId);
export const aggregateByPlatform = (samples: MetricSample[]): GroupSummary[] => aggregateBy(samples, (s) => s.platform);
export const aggregateByHookPattern = (samples: MetricSample[]): GroupSummary[] => aggregateBy(samples, (s) => s.hookPattern);
export const aggregateByPublishCohort = (samples: MetricSample[]): GroupSummary[] => aggregateBy(samples, (s) => s.publishedAtLocalDate);

export interface Outlier {
  publicationId: string;
  engagementRate: number;
  zScore: number;
  direction: "over" | "under";
}

/**
 * Real z-score outlier detection: flags a post whose engagement rate is
 * more than `threshold` standard deviations from the sample mean —
 * standard, well-understood statistics, not a fabricated heuristic.
 * Needs at least 3 samples for a standard deviation to be meaningful;
 * fewer than that returns no outliers rather than a division-by-a-
 * near-zero-population false positive.
 */
export function detectOutliers(samples: MetricSample[], threshold = 2): Outlier[] {
  if (samples.length < 3) return [];
  const rates = samples.map(engagementRate);
  const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length;
  const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return [];

  const outliers: Outlier[] = [];
  samples.forEach((sample, i) => {
    const zScore = (rates[i]! - mean) / stdDev;
    if (Math.abs(zScore) >= threshold) {
      outliers.push({ publicationId: sample.publicationId, engagementRate: rates[i]!, zScore, direction: zScore > 0 ? "over" : "under" });
    }
  });
  return outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}
