"use client";

import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, Text, type SidebarItem } from "@velocity/ui";
import { useEffect, useState } from "react";
import styles from "./admin.module.css";

type UserSearchResult = Awaited<ReturnType<typeof trpcClient.admin.users.search.query>>[number];
type WorkspaceSummary = Awaited<ReturnType<typeof trpcClient.admin.workspaces.list.query>>[number];
type PendingReview = Awaited<ReturnType<typeof trpcClient.admin.moderation.listPending.query>>[number];
type AuditLogRow = Awaited<ReturnType<typeof trpcClient.admin.auditLog.list.query>>[number];
type AiProviderConfig = Awaited<ReturnType<typeof trpcClient.admin.aiModels.list.query>>[number];
type RiskSignal = Awaited<ReturnType<typeof trpcClient.admin.risk.list.query>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
  { id: "admin", label: "Admin", icon: <span aria-hidden>⛭</span>, href: "/admin", active: true },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings" },
];

const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

/**
 * STEP 18's Admin console — a superadmin/support/moderator/finance-only
 * surface (every procedure it calls is gated on a real platform
 * permission, not a client-side check; this page is the trigger, not the
 * authorization boundary). Real, functional, not maximally polished — the
 * same precedent as accounts/agency/UGC Studio. No client-side role gate
 * here deliberately: an unauthorized visitor sees empty panels and
 * FORBIDDEN errors from every query, which is the correct behaviour when
 * the server is the actual authority.
 */
export default function AdminPage() {
  const [health, setHealth] = useState<{ databaseReachable: boolean } | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [suspendReason, setSuspendReason] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<AiProviderConfig[]>([]);
  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshStatic = async () => {
    try {
      const [healthResult, workspaceResults, pendingResults, auditResults, providerResults, riskResults, ...pauseResults] = await Promise.all([
        trpcClient.admin.systemHealth.query(),
        trpcClient.admin.workspaces.list.query(),
        trpcClient.admin.moderation.listPending.query(),
        trpcClient.admin.auditLog.list.query({ limit: 50 }),
        trpcClient.admin.aiModels.list.query(),
        trpcClient.admin.risk.list.query(),
        ...PLATFORMS.map((platform) => trpcClient.admin.platformPause.get.query({ platform })),
      ]);
      setHealth(healthResult);
      setWorkspaces(workspaceResults);
      setPendingReviews(pendingResults);
      setAuditLogs(auditResults);
      setProviderConfigs(providerResults);
      setRiskSignals(riskResults);
      setPaused(Object.fromEntries(PLATFORMS.map((platform, i) => [platform, pauseResults[i] as boolean])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data — you may not hold a platform permission for this page");
    }
  };

  useEffect(() => {
    void refreshStatic();
  }, []);

  const handleSearchUsers = async () => {
    if (!userQuery.trim()) return;
    setUsers(await trpcClient.admin.users.search.query({ query: userQuery.trim() }));
  };

  const handleSuspend = async (targetUserId: string) => {
    if (!suspendReason.trim()) {
      setError("A suspension reason is required.");
      return;
    }
    await trpcClient.admin.users.suspend.mutate({ targetUserId, reason: suspendReason.trim() });
    setSuspendReason("");
    await handleSearchUsers();
  };

  const handleUnsuspend = async (targetUserId: string) => {
    await trpcClient.admin.users.unsuspend.mutate({ targetUserId });
    await handleSearchUsers();
  };

  const handleArchiveWorkspace = async (workspaceId: string) => {
    await trpcClient.admin.workspaces.archive.mutate({ workspaceId });
    await refreshStatic();
  };

  const handleUnarchiveWorkspace = async (workspaceId: string) => {
    await trpcClient.admin.workspaces.unarchive.mutate({ workspaceId });
    await refreshStatic();
  };

  const handleTogglePause = async (platform: (typeof PLATFORMS)[number]) => {
    await trpcClient.admin.platformPause.set.mutate({ platform, paused: !paused[platform] });
    await refreshStatic();
  };

  const handleResolveReview = async (review: PendingReview, decision: "approved" | "rejected") => {
    await trpcClient.admin.moderation.resolve.mutate({ workspaceId: review.workspaceId, reviewId: review.id, decision });
    await refreshStatic();
  };

  const handleToggleProvider = async (config: AiProviderConfig) => {
    await trpcClient.admin.aiModels.upsert.mutate({
      kind: config.kind,
      providerId: config.providerId,
      enabled: !config.enabled,
      weight: config.weight,
      tiers: config.tiers,
      adapter: config.adapter as "stub" | "http",
      breakerFailureThreshold: config.breakerFailureThreshold,
      breakerWindowSec: config.breakerWindowSec,
      breakerCooldownSec: config.breakerCooldownSec,
    });
    await refreshStatic();
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Admin
        </Text>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            System health
          </Text>
          {health && <span className={health.databaseReachable ? styles.badgeOk : styles.badge}>{health.databaseReachable ? "DATABASE REACHABLE" : "DATABASE UNREACHABLE"}</span>}
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Global publish pause
          </Text>
          <Text variant="body" as="p">
            The 60-second kill switch (GATE 18) — every worker process picks this up on the next preflight check, with no deploy.
          </Text>
          <ul className={styles.list}>
            {PLATFORMS.map((platform) => (
              <li key={platform} className={styles.listItem}>
                <Text variant="body" as="span">
                  {platform}
                </Text>
                <span className={paused[platform] ? styles.badge : styles.badgeOk}>{paused[platform] ? "PAUSED" : "LIVE"}</span>
                <button type="button" className={styles.actionButton} onClick={() => void handleTogglePause(platform)}>
                  {paused[platform] ? "Resume" : "Pause"}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Users
          </Text>
          <div className={styles.form}>
            <input className={styles.input} placeholder="Search by email or name" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
            <button type="button" className={styles.actionButton} onClick={() => void handleSearchUsers()}>
              Search
            </button>
          </div>
          <input className={styles.input} placeholder="Suspension reason (required to suspend)" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
          <ul className={styles.list}>
            {users.map((u) => (
              <li key={u.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  {u.email} {u.name ? `(${u.name})` : ""}
                </Text>
                {u.suspendedAt ? (
                  <>
                    <span className={styles.badge}>SUSPENDED: {u.suspendedReason}</span>
                    <button type="button" className={styles.actionButton} onClick={() => void handleUnsuspend(u.id)}>
                      Unsuspend
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.dangerButton} onClick={() => void handleSuspend(u.id)}>
                    Suspend
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Workspaces
          </Text>
          <ul className={styles.list}>
            {workspaces.map((w) => (
              <li key={w.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  {w.name} ({w.workspaceType})
                </Text>
                {w.deletedAt ? (
                  <>
                    <span className={styles.badge}>ARCHIVED</span>
                    <button type="button" className={styles.actionButton} onClick={() => void handleUnarchiveWorkspace(w.id)}>
                      Unarchive
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.dangerButton} onClick={() => void handleArchiveWorkspace(w.id)}>
                    Archive
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            AI model management
          </Text>
          <Text variant="body" as="p">
            The DB-backed provider config apps/worker&apos;s router reloads every 30s — a change here reaches every worker within GATE 18&apos;s 60-second bound.
          </Text>
          <ul className={styles.list}>
            {providerConfigs.map((c) => (
              <li key={c.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  {c.kind}:{c.providerId} — weight {c.weight}
                </Text>
                <span className={c.enabled ? styles.badgeOk : styles.badge}>{c.enabled ? "ENABLED" : "DISABLED"}</span>
                <button type="button" className={styles.actionButton} onClick={() => void handleToggleProvider(c)}>
                  {c.enabled ? "Disable" : "Enable"}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Content moderation queue
          </Text>
          <ul className={styles.list}>
            {pendingReviews.map((r) => (
              <li key={r.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  {r.targetType} {r.targetId.slice(0, 8)} — {r.notes ?? "no notes"}
                </Text>
                <button type="button" className={styles.actionButton} onClick={() => void handleResolveReview(r, "approved")}>
                  Approve
                </button>
                <button type="button" className={styles.dangerButton} onClick={() => void handleResolveReview(r, "rejected")}>
                  Reject
                </button>
              </li>
            ))}
            {pendingReviews.length === 0 && (
              <Text variant="body" as="p">
                No pending reviews.
              </Text>
            )}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Fraud / risk signals
          </Text>
          <ul className={styles.list}>
            {riskSignals.slice(0, 20).map((s) => (
              <li key={s.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  {s.signalType} — {s.severity}
                </Text>
              </li>
            ))}
            {riskSignals.length === 0 && (
              <Text variant="body" as="p">
                No recorded risk signals.
              </Text>
            )}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Audit log
          </Text>
          <ul className={styles.list}>
            {auditLogs.map((l) => (
              <li key={l.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  {l.action} — {l.targetType}:{l.targetId.slice(0, 8)} — {new Date(l.createdAt).toLocaleString()}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
