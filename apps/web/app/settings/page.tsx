"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, EmptyState, Text, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./settings.module.css";

type Workspace = Awaited<ReturnType<typeof trpcClient.workspace.get.query>>;
type Member = Awaited<ReturnType<typeof trpcClient.workspace.members.list.query>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
  { id: "billing", label: "Billing", icon: <span aria-hidden>$</span>, href: "/billing" },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings", active: true },
];

const INVITE_ROLES = ["admin", "editor", "contributor", "viewer"] as const;

/**
 * A real gap this build's own step summaries never flagged: workspace.ts
 * already had `get`/`update`/`members.list`/`members.invite` procedures
 * with real, tested logic behind them (STEP 3/4) — nothing here was ever
 * exposed through a page. Built the same way every other real-but-
 * unwired-up surface in this build has been (STEP 15's moderation
 * reviews, STEP 18's admin console): give existing, working backend logic
 * its first real reader/writer, not new backend work.
 */
export default function SettingsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]>("editor");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [workspaceResult, membersResult] = await Promise.all([trpcClient.workspace.get.query(), trpcClient.workspace.members.list.query()]);
    setWorkspace(workspaceResult);
    setName(workspaceResult.name);
    setTimezone(workspaceResult.timezone);
    setMembers(membersResult);
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspace settings"));
  }, [currentWorkspaceId, refresh]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await trpcClient.workspace.update.mutate({ name, timezone });
      await refresh();
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setError(null);
    try {
      await trpcClient.workspace.members.invite.mutate({ email: inviteEmail.trim(), roleKey: inviteRole });
      setInviteEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Settings
        </Text>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {!currentWorkspaceId || workspace === null ? (
          <Text variant="body" as="p">
            Loading…
          </Text>
        ) : (
          <>
            <section className={styles.card}>
              <Text variant="label" as="p" className={styles.sectionLabel}>
                Workspace
              </Text>
              <div className={styles.form}>
                <label className={styles.fieldGroup}>
                  <Text variant="label" as="span">
                    Name
                  </Text>
                  <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className={styles.fieldGroup}>
                  <Text variant="label" as="span">
                    Timezone
                  </Text>
                  <input className={styles.input} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/London" />
                </label>
                <button type="button" className={styles.actionButton} onClick={() => void handleSave()} disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {savedAt && (
                  <Text variant="label" as="span" className={styles.savedLabel}>
                    Saved
                  </Text>
                )}
              </div>
            </section>

            <section className={styles.card}>
              <Text variant="label" as="p" className={styles.sectionLabel}>
                Members
              </Text>

              {members !== null && members.length === 0 && <EmptyState heading="No members yet" body="Invite a teammate below to give them access to this workspace." />}

              {members !== null && members.length > 0 && (
                <div className={styles.memberList}>
                  {members.map((member) => (
                    <div key={member.userId} className={styles.memberRow}>
                      <div className={styles.memberIdentity}>
                        <Text variant="body" as="span">
                          {member.name ?? member.email}
                        </Text>
                        <Text variant="label" as="span" className={styles.memberEmail}>
                          {member.email}
                        </Text>
                      </div>
                      <Text variant="label" as="span" className={styles.roleBadge}>
                        {member.roleKey}
                      </Text>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.form}>
                <input className={styles.input} type="email" placeholder="teammate@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                <select className={styles.input} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as (typeof INVITE_ROLES)[number])}>
                  {INVITE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button type="button" className={styles.actionButton} onClick={() => void handleInvite()} disabled={!inviteEmail.trim()}>
                  Invite
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
