"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AccountChip, AppSidebar, EmptyState, Text, type AccountHealth, type SidebarItem } from "@velocity/ui";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import styles from "./accounts.module.css";

type AccountRow = Awaited<ReturnType<typeof trpcClient.social.accounts.list.query>>[number];
type QuotaRow = Awaited<ReturnType<typeof trpcClient.social.quota.list.query>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts", active: true },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
];

const PLATFORM_GLYPH: Record<string, string> = { tiktok: "TT", instagram: "IG", youtube: "YT" };
const CONNECTABLE_PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

function healthFor(connectionStatus: string): AccountHealth {
  if (connectionStatus === "connected") return "healthy";
  if (connectionStatus === "reauth_required") return "warning";
  return "error";
}

/**
 * STEP 11's Social Integrations: real OAuth connect/disconnect/reconnect
 * for TikTok/Instagram/YouTube, per-account health (`AccountChip`'s
 * existing `health` prop, STEP 7), and quota state. "Connect" redirects
 * the whole browser to the platform's real consent screen — there is no
 * way to do this via a background fetch, by design (OAuth authorization
 * requires the user to interact with the platform's own page).
 *
 * GATE 11 note (see docs/steps/STEP-11.md): connecting against a LIVE
 * platform needs real, audited app registrations this sandbox doesn't
 * have — the OAuth adapters, callback handling, encryption, and quota/
 * health logic are all real and tested against local mock responses; a
 * live click-through isn't possible here, the same category of gap as
 * every other funded-credential dependency in this codebase.
 */
export default function AccountsPage() {
  return (
    <Suspense fallback={null}>
      <AccountsPageContent />
    </Suspense>
  );
}

/** useSearchParams() forces this subtree to opt out of static prerendering unless wrapped in Suspense (Next.js 15 requirement) — split out so the rest of the page's structure isn't forced into the same boundary unnecessarily. */
function AccountsPageContent() {
  const { currentWorkspaceId } = useWorkspace();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [quota, setQuota] = useState<QuotaRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const rows = await trpcClient.social.accounts.list.query();
    setAccounts(rows);
    const quotaRows = await trpcClient.social.quota.list.query();
    setQuota(quotaRows);
  }, [currentWorkspaceId]);

  useEffect(() => {
    setError(null);
    fetchAccounts().catch((err) => setError(err instanceof Error ? err.message : "Failed to load accounts"));
  }, [fetchAccounts]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connected) setBanner(`${connected[0]!.toUpperCase()}${connected.slice(1)} connected.`);
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  const handleConnect = async (platform: (typeof CONNECTABLE_PLATFORMS)[number]) => {
    try {
      const { url } = await trpcClient.social.oauth.authorizationUrl.mutate({ platform });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to start ${platform} connection`);
    }
  };

  const handleDisconnect = async (socialAccountId: string) => {
    try {
      await trpcClient.social.accounts.disconnect.mutate({ socialAccountId });
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Text variant="heading" as="h1">
            Accounts
          </Text>
          <div className={styles.connectRow}>
            {CONNECTABLE_PLATFORMS.map((platform) => (
              <button key={platform} type="button" className={styles.connectButton} onClick={() => handleConnect(platform)}>
                Connect {PLATFORM_GLYPH[platform]}
              </button>
            ))}
          </div>
        </div>

        {banner && (
          <p>
            <Text variant="body" as="span">
              {banner}
            </Text>
          </p>
        )}
        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {!error && accounts === null && (
          <Text variant="body" as="p">
            Loading…
          </Text>
        )}

        {accounts !== null && accounts.length === 0 && <EmptyState heading="No accounts connected" body="Connect a TikTok, Instagram or YouTube account to start scheduling and publishing." />}

        {accounts !== null && accounts.length > 0 && (
          <div className={styles.accountList}>
            {accounts.map((account) => {
              const accountQuota = quota.find((q) => q.quota.socialAccountId === account.id);
              return (
                <div key={account.id} className={styles.accountRow}>
                  <AccountChip
                    avatar={<span className={styles.avatarGlyph}>{account.handle?.slice(0, 2).toUpperCase() ?? "?"}</span>}
                    platformMark={<span className={styles.platformGlyph}>{PLATFORM_GLYPH[account.platform]}</span>}
                    handle={account.handle ?? account.platform}
                    health={healthFor(account.connectionStatus)}
                  />
                  <Text variant="label" as="span" className={styles.statusLabel}>
                    {account.connectionStatus === "reauth_required" ? "Reconnect needed" : account.connectionStatus}
                  </Text>
                  {accountQuota && (
                    <Text variant="numeral" as="span" className={styles.quotaLabel}>
                      {accountQuota.quota.requestCount}/{accountQuota.quota.requestCap} used today
                    </Text>
                  )}
                  <div className={styles.actions}>
                    {account.connectionStatus === "reauth_required" && (
                      <button type="button" className={styles.connectButton} onClick={() => handleConnect(account.platform)}>
                        Reconnect
                      </button>
                    )}
                    <button type="button" className={styles.disconnectButton} onClick={() => handleDisconnect(account.id)}>
                      Disconnect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
