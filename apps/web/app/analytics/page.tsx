"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, EmptyState, Text, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./analytics.module.css";

type SummaryRow = Awaited<ReturnType<typeof trpcClient.analytics.summary.query>>[number];
type OutlierRow = Awaited<ReturnType<typeof trpcClient.analytics.outliers.query>>[number];
type GroupBy = "platform" | "format" | "hookPattern" | "angle" | "cohort";

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics", active: true },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
];

const GROUP_TABS: { key: GroupBy; label: string }[] = [
  { key: "platform", label: "Platform" },
  { key: "format", label: "Format" },
  { key: "hookPattern", label: "Hook pattern" },
  { key: "angle", label: "Angle" },
  { key: "cohort", label: "Publish date" },
];

/**
 * STEP 13's real dashboard surface: per-format/angle/persona/platform/
 * hook-pattern/cohort summaries (routers/analytics.ts's `summary`,
 * grouped server-side by packages/core's real aggregation functions),
 * outlier detection, CSV export, and a manual "close the loop" trigger
 * (applies real performance-derived updates to the Velocity bandit —
 * no scheduler exists yet to run this automatically, see
 * docs/steps/STEP-13.md).
 */
export default function AnalyticsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [groupBy, setGroupBy] = useState<GroupBy>("platform");
  const [rows, setRows] = useState<SummaryRow[] | null>(null);
  const [outliers, setOutliers] = useState<OutlierRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closingLoop, setClosingLoop] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const result = await trpcClient.analytics.summary.query({ groupBy });
    setRows(result);
  }, [currentWorkspaceId, groupBy]);

  useEffect(() => {
    setError(null);
    fetchSummary().catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics"));
  }, [fetchSummary]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    trpcClient.analytics.outliers.query().then(setOutliers).catch(() => undefined);
  }, [currentWorkspaceId]);

  const handleExportCsv = async () => {
    try {
      const csv = await trpcClient.analytics.exportCsv.query();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "analytics-export.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV export failed");
    }
  };

  const handleCloseLoop = async () => {
    setClosingLoop(true);
    setNotice(null);
    try {
      const result = await trpcClient.analytics.closeLoop.mutate();
      setNotice(`Updated ${result.dimensionsUpdated} bandit dimension${result.dimensionsUpdated === 1 ? "" : "s"} from ${result.samplesConsidered} published post${result.samplesConsidered === 1 ? "" : "s"}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to close the loop");
    } finally {
      setClosingLoop(false);
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Text variant="heading" as="h1">
            Analytics
          </Text>
          <div className={styles.actions}>
            <button type="button" className={styles.smallButton} onClick={handleExportCsv}>
              Export CSV
            </button>
            <button type="button" className={styles.approveButton} onClick={handleCloseLoop} disabled={closingLoop}>
              {closingLoop ? "Closing the loop…" : "Close the loop"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}
        {notice && (
          <p>
            <Text variant="body" as="span">
              {notice}
            </Text>
          </p>
        )}

        <div className={styles.viewTabs} role="tablist" aria-label="Group by">
          {GROUP_TABS.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={groupBy === tab.key} className={groupBy === tab.key ? styles.tabActive : styles.tab} onClick={() => setGroupBy(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {!error && rows === null && (
          <Text variant="body" as="p">
            Loading…
          </Text>
        )}

        {rows !== null && rows.length === 0 && <EmptyState heading="No performance data yet" body="Once posts publish and their metrics are ingested, summaries by platform, format, hook pattern, angle, and publish date will appear here." />}

        {rows !== null && rows.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{GROUP_TABS.find((t) => t.key === groupBy)?.label}</th>
                <th>Posts</th>
                <th>Views</th>
                <th>Avg engagement</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
                .map((row) => (
                  <tr key={row.key}>
                    <td>{row.key}</td>
                    <td>{row.count}</td>
                    <td>{row.totalViews.toLocaleString()}</td>
                    <td>{(row.avgEngagementRate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        <div className={styles.outliersSection}>
          <Text variant="label" as="p">
            Outliers
          </Text>
          {outliers.length === 0 ? (
            <Text variant="body" as="p">
              No statistical outliers yet.
            </Text>
          ) : (
            <ul className={styles.outliersList}>
              {outliers.map((o) => (
                <li key={o.publicationId}>
                  <Text variant="body" as="span">
                    {o.direction === "over" ? "Overperformed" : "Underperformed"} by {o.zScore.toFixed(1)}σ — publication {o.publicationId.slice(0, 8)} ({(o.engagementRate * 100).toFixed(1)}% engagement)
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
