"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, EmptyState, Text, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./notifications.module.css";

type Notification = Awaited<ReturnType<typeof trpcClient.notifications.list.query>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "competitors", label: "Competitors", icon: <span aria-hidden>◧</span>, href: "/competitors" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "brand", label: "Brand", icon: <span aria-hidden>◐</span>, href: "/brand" },
  { id: "media", label: "Media", icon: <span aria-hidden>▦</span>, href: "/media" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
  { id: "billing", label: "Billing", icon: <span aria-hidden>$</span>, href: "/billing" },
  { id: "developers", label: "Developers", icon: <span aria-hidden>⌘</span>, href: "/developers" },
  { id: "notifications", label: "Notifications", icon: <span aria-hidden>◒</span>, href: "/notifications", active: true },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings" },
];

/**
 * A real gap found in a full-scope page audit: the notification bus
 * (STEP 7) has been publishing real events — credit_low, invitation
 * received, automation alerts, GATE 18's platform-pause notices — since
 * early in this build, and notifications.ts's list/markRead/preferences
 * procedures are real and tested, but nothing ever gave a user a way to
 * actually see them.
 */
export default function NotificationsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, prefs] = await Promise.all([trpcClient.notifications.list.query(), trpcClient.notifications.preferences.get.query()]);
    setNotifications(list);
    setPreferences(prefs as Record<string, boolean>);
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load notifications"));
  }, [currentWorkspaceId, load]);

  const handleMarkRead = async (notificationId: string) => {
    await trpcClient.notifications.markRead.mutate({ notificationId });
    await load();
  };

  const handleTogglePreference = async (key: string, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    await trpcClient.notifications.preferences.update.mutate({ preferences: next });
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Notifications
        </Text>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {!currentWorkspaceId || notifications === null ? (
          <Text variant="body" as="p">
            Loading…
          </Text>
        ) : notifications.length === 0 ? (
          <EmptyState heading="No notifications yet" body="Credit alerts, invitations, and automation runs will show up here." />
        ) : (
          <div className={styles.list}>
            {notifications.map((n) => (
              <div key={n.id} className={n.readAt ? styles.rowRead : styles.row}>
                <div className={styles.rowBody}>
                  <Text variant="body" as="span">
                    {n.title}
                  </Text>
                  <Text variant="label" as="span" className={styles.rowMeta}>
                    {n.body} · {new Date(n.createdAt).toLocaleString()}
                  </Text>
                </div>
                {!n.readAt && (
                  <button type="button" className={styles.markReadButton} onClick={() => void handleMarkRead(n.id)}>
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <section className={styles.card}>
          <Text variant="label" as="p" className={styles.sectionLabel}>
            Preferences
          </Text>
          {Object.keys(preferences).length === 0 ? (
            <Text variant="body" as="p">
              Every notification type is on by default until you opt one out.
            </Text>
          ) : (
            <div className={styles.prefList}>
              {Object.entries(preferences).map(([key, enabled]) => (
                <label key={key} className={styles.prefRow}>
                  <Text variant="body" as="span">
                    {key}
                  </Text>
                  <input type="checkbox" checked={enabled} onChange={(e) => void handleTogglePreference(key, e.target.checked)} />
                </label>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
