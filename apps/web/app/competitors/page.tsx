"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, EmptyState, Text, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./competitors.module.css";

type Competitor = Awaited<ReturnType<typeof trpcClient.growthBrain.competitors.list.query>>[number];

const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "competitors", label: "Competitors", icon: <span aria-hidden>◧</span>, href: "/competitors", active: true },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "brand", label: "Brand", icon: <span aria-hidden>◐</span>, href: "/brand" },
  { id: "media", label: "Media", icon: <span aria-hidden>▦</span>, href: "/media" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
  { id: "billing", label: "Billing", icon: <span aria-hidden>$</span>, href: "/billing" },
  { id: "developers", label: "Developers", icon: <span aria-hidden>⌘</span>, href: "/developers" },
  { id: "notifications", label: "Notifications", icon: <span aria-hidden>◒</span>, href: "/notifications" },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings" },
];

/**
 * A real gap found in a full-scope page audit: growth-brain.ts's
 * `competitors` sub-router (STEP 14) is real and tested — add a
 * competitor, then log an observed post's real public numbers, which
 * feeds the same blueprint-extraction pipeline STEP 8.3 built for organic
 * trend discovery. Automated discovery is YouTube-only (its Data API
 * genuinely supports keyless public-channel lookup); TikTok/Instagram
 * deliberately stay manual-submission-only — a real ToS-compliance
 * decision documented in STEP 14, not a missing feature. This page is
 * the manual-submission path's first (and only) UI.
 */
export default function CompetitorsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [competitors, setCompetitors] = useState<Competitor[] | null>(null);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("tiktok");
  const [externalRef, setExternalRef] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [logTarget, setLogTarget] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [niche, setNiche] = useState("");
  const [views, setViews] = useState("");
  const [observedRef, setObservedRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await trpcClient.growthBrain.competitors.list.query();
    setCompetitors(rows);
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load competitors"));
  }, [currentWorkspaceId, load]);

  const handleAdd = async () => {
    if (!externalRef.trim() || !displayName.trim()) return;
    setError(null);
    try {
      await trpcClient.growthBrain.competitors.create.mutate({ platform, externalRef: externalRef.trim(), displayName: displayName.trim() });
      setExternalRef("");
      setDisplayName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add competitor");
    }
  };

  const handleLogPost = async () => {
    if (!logTarget || !captionText.trim() || !niche.trim() || !observedRef.trim()) return;
    setError(null);
    setNotice(null);
    try {
      await trpcClient.growthBrain.competitors.ingestObservedPost.mutate({
        competitorId: logTarget,
        captionText: captionText.trim(),
        postedAt: new Date().toISOString(),
        niche: niche.trim(),
        views: views ? Number(views) : undefined,
        observedRef: observedRef.trim(),
      });
      setNotice("Blueprint extracted from this post.");
      setCaptionText("");
      setNiche("");
      setViews("");
      setObservedRef("");
      setLogTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log observed post");
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Competitors
        </Text>
        <Text variant="body" as="p">
          Track competitor accounts. TikTok and Instagram require you to log what you can already see on a public profile — official APIs don&rsquo;t offer third-party discovery for those platforms.
        </Text>

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

        {!currentWorkspaceId || competitors === null ? (
          <Text variant="body" as="p">
            Loading…
          </Text>
        ) : competitors.length === 0 ? (
          <EmptyState heading="No competitors tracked yet" body="Add one below to start logging their public posts." />
        ) : (
          <div className={styles.list}>
            {competitors.map((competitor) => (
              <div key={competitor.id} className={styles.row}>
                <div className={styles.rowBody}>
                  <Text variant="body" as="span">
                    {competitor.displayName}
                  </Text>
                  <Text variant="label" as="span" className={styles.meta}>
                    {competitor.platform} · {competitor.externalRef}
                  </Text>
                </div>
                <button type="button" className={styles.actionButtonSmall} onClick={() => setLogTarget(competitor.id)}>
                  Log a post
                </button>
              </div>
            ))}
          </div>
        )}

        <section className={styles.card}>
          <Text variant="label" as="p" className={styles.sectionLabel}>
            Add a competitor
          </Text>
          <div className={styles.form}>
            <select className={styles.input} value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input className={styles.input} placeholder="@handle or channel id" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
            <input className={styles.input} placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <button type="button" className={styles.actionButton} onClick={() => void handleAdd()}>
              Add
            </button>
          </div>
        </section>

        {logTarget && (
          <section className={styles.card}>
            <Text variant="label" as="p" className={styles.sectionLabel}>
              Log an observed post
            </Text>
            <div className={styles.form}>
              <textarea className={styles.textarea} placeholder="Caption text" rows={3} value={captionText} onChange={(e) => setCaptionText(e.target.value)} />
              <input className={styles.input} placeholder="Niche" value={niche} onChange={(e) => setNiche(e.target.value)} />
              <input className={styles.input} type="number" placeholder="Views (optional)" value={views} onChange={(e) => setViews(e.target.value)} />
              <input className={styles.input} placeholder="Post URL or reference" value={observedRef} onChange={(e) => setObservedRef(e.target.value)} />
              <div className={styles.formActions}>
                <button type="button" className={styles.actionButton} onClick={() => void handleLogPost()}>
                  Extract blueprint
                </button>
                <button type="button" className={styles.actionButtonSmall} onClick={() => setLogTarget(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
