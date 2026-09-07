import type { EmailMessage } from "../auth/email-provider.js";
import type { GroupSummary, Outlier } from "./aggregate.js";

/**
 * Scheduled email reports (STEP 13) — a pure content-builder, reusing
 * STEP 3's real `EmailProvider` interface rather than inventing a
 * parallel one. No cron trigger exists to call this on a schedule yet
 * (the same "no scheduler wired up" gap STEP 11's token-refresh daemon
 * and STEP 12's publish trigger already flagged) — this function is the
 * real, tested report-generation logic a future scheduled job would call.
 */

export interface WeeklyReportInput {
  workspaceName: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  byFormat: GroupSummary[];
  byHookPattern: GroupSummary[];
  byPlatform: GroupSummary[];
  outliers: Outlier[];
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function summaryLines(label: string, summaries: GroupSummary[]): string[] {
  const sorted = [...summaries].sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  return [`${label}:`, ...sorted.map((s) => `  ${s.key}: ${formatRate(s.avgEngagementRate)} avg engagement across ${s.count} post${s.count === 1 ? "" : "s"} (${s.totalViews} views)`)];
}

export function buildWeeklyReport(input: WeeklyReportInput): EmailMessage {
  const lines: string[] = [
    `Weekly performance report for ${input.workspaceName}`,
    `${input.periodStart} to ${input.periodEnd}`,
    "",
    ...summaryLines("By platform", input.byPlatform),
    "",
    ...summaryLines("By format", input.byFormat),
    "",
    ...summaryLines("By hook pattern", input.byHookPattern),
    "",
  ];

  if (input.outliers.length > 0) {
    lines.push("Outliers this period:");
    for (const outlier of input.outliers) {
      lines.push(`  ${outlier.direction === "over" ? "Overperformed" : "Underperformed"} by ${outlier.zScore.toFixed(1)}σ: publication ${outlier.publicationId} (${formatRate(outlier.engagementRate)} engagement)`);
    }
  } else {
    lines.push("No statistical outliers this period.");
  }

  const text = lines.join("\n");
  return {
    to: "",
    subject: `Weekly report: ${input.workspaceName} (${input.periodStart}–${input.periodEnd})`,
    text,
  };
}
