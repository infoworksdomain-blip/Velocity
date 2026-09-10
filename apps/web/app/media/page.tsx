"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, EmptyState, Text, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./media.module.css";

type MediaAsset = Awaited<ReturnType<typeof trpcClient.media.list.query>>[number];

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
  { id: "media", label: "Media", icon: <span aria-hidden>▦</span>, href: "/media", active: true },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
  { id: "billing", label: "Billing", icon: <span aria-hidden>$</span>, href: "/billing" },
  { id: "developers", label: "Developers", icon: <span aria-hidden>⌘</span>, href: "/developers" },
  { id: "notifications", label: "Notifications", icon: <span aria-hidden>◒</span>, href: "/notifications" },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings" },
];

/**
 * A real gap found in a full-scope page audit: media.ts (build script
 * 8.6) has real, tested list/get/searchByTag procedures over
 * media_assets — nothing ever read them. Empty for every real workspace
 * right now for an honest reason, not a bug: nothing populates
 * media_assets yet without a funded video/image provider actually
 * rendering something (same funded-credential gap as every generation
 * feature in this build).
 */
export default function MediaPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await trpcClient.media.list.query({ limit: 50 });
    setAssets(rows);
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load media library"));
  }, [currentWorkspaceId, load]);

  const handleSearch = async () => {
    if (!tag.trim()) {
      await load();
      return;
    }
    setError(null);
    try {
      const rows = await trpcClient.media.searchByTag.query({ tag: tag.trim() });
      setAssets(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Text variant="heading" as="h1">
            Media
          </Text>
          <div className={styles.searchRow}>
            <input className={styles.input} placeholder="Search by tag" value={tag} onChange={(e) => setTag(e.target.value)} />
            <button type="button" className={styles.actionButton} onClick={() => void handleSearch()}>
              Search
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

        {!currentWorkspaceId || assets === null ? (
          <Text variant="body" as="p">
            Loading…
          </Text>
        ) : assets.length === 0 ? (
          <EmptyState heading="No media yet" body="Generated shots, voiceovers, and final renders will appear here once your workspace has a funded video or image provider configured." />
        ) : (
          <div className={styles.grid}>
            {assets.map((asset) => (
              <div key={asset.id} className={styles.card}>
                <Text variant="body" as="span">
                  {asset.sourceKind} · {asset.contentType}
                </Text>
                <Text variant="label" as="span" className={styles.meta}>
                  {(asset.tags as string[]).join(", ") || "untagged"}
                </Text>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
