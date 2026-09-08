"use client";

import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import {
  AccountChip,
  AppSidebar,
  CreditMeter,
  EmptyState,
  StatCard,
  Text,
  type SidebarItem,
} from "@velocity/ui";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./dashboard.module.css";

type DashboardData = Awaited<ReturnType<typeof trpcClient.dashboard.get.query>>;
type WorkspaceListItem = Awaited<ReturnType<typeof trpcClient.workspace.listMine.query>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard", active: true },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
];

const PLATFORM_GLYPH: Record<string, string> = { tiktok: "TT", instagram: "IG", youtube: "YT" };

/**
 * STEP 7 decision 4: every widget here queries real tables through
 * dashboard.get — there is no fabricated data. Most numbers are honestly
 * zero in a fresh workspace because content generation (STEP 8/9),
 * scheduling (STEP 10), social account linking (STEP 11) and publishing/
 * metrics ingestion (STEP 12/13) haven't shipped their producers yet. See
 * docs/steps/STEP-07.md.
 */
export default function DashboardPage() {
  const { currentWorkspaceId, setCurrentWorkspaceId } = useWorkspace();
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trpcClient.workspace.listMine
      .query()
      .then((rows) => {
        setWorkspaces(rows);
        if (!currentWorkspaceId && rows[0]) setCurrentWorkspaceId(rows[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspaces"));
    // Only ever needs to run once on mount — currentWorkspaceId's own
    // changes are handled by the effect below, not by re-listing workspaces.
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    trpcClient.dashboard.get
      .query()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, [currentWorkspaceId]);

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Text variant="heading" as="h1">
            Dashboard
          </Text>
          <WorkspaceSwitcher workspaces={workspaces} />
        </div>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {!error && !data && currentWorkspaceId && (
          <Text variant="body" as="p">
            Loading…
          </Text>
        )}

        {!currentWorkspaceId && !error && (
          <EmptyState heading="No workspace yet" body="Complete onboarding to create your first workspace." />
        )}

        {data && <DashboardBody data={data} />}
      </main>
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const sections =
    data.workspaceType === "business"
      ? (["nextAction", "accounts", "performance", "velocity", "credit"] as const)
      : (["credit", "nextAction", "velocity", "performance", "accounts"] as const);

  const sectionRenderers: Record<(typeof sections)[number], () => ReactNode> = {
    credit: () => <CreditMeter key="credit" balance={data.creditBalance} limit={data.creditLimit} />,
    nextAction: () => (
      <div key="nextAction" className={styles.nextAction}>
        <EmptyState heading="Next best action" body={data.nextBestAction} />
      </div>
    ),
    velocity: () => (
      <div key="velocity" className={styles.statGrid}>
        <StatCard label="Velocity queue" value={String(data.velocityPendingCount)} />
        <StatCard label="Scheduled" value={String(data.upcomingScheduledCount)} />
      </div>
    ),
    performance: () => (
      <section key="performance" className={styles.section}>
        <Text variant="label" as="p">
          Last 7 days
        </Text>
        <div className={styles.statGrid}>
          <StatCard label="Views" value={data.last7DaysPerformance.views.toLocaleString()} />
          <StatCard label="Likes" value={data.last7DaysPerformance.likes.toLocaleString()} />
          <StatCard label="Comments" value={data.last7DaysPerformance.comments.toLocaleString()} />
          <StatCard label="Shares" value={data.last7DaysPerformance.shares.toLocaleString()} />
        </div>
      </section>
    ),
    accounts: () => (
      <section key="accounts" className={styles.section}>
        <Text variant="label" as="p">
          Connected accounts
        </Text>
        {data.connectedAccounts.length === 0 ? (
          <EmptyState
            heading="No accounts connected"
            body="Connect a TikTok, Instagram or YouTube account to start publishing."
          />
        ) : (
          <div className={styles.accountRow}>
            {data.connectedAccounts.map((account) => (
              <AccountChip
                key={account.id}
                avatar={<span className={styles.avatarGlyph}>{account.handle?.slice(0, 2).toUpperCase() ?? "?"}</span>}
                platformMark={<span className={styles.platformGlyph}>{PLATFORM_GLYPH[account.platform]}</span>}
                handle={account.handle ?? account.platform}
                health="healthy"
              />
            ))}
          </div>
        )}
      </section>
    ),
  };

  return <>{sections.map((key) => sectionRenderers[key]())}</>;
}
