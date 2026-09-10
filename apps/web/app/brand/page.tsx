"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, Text, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./brand.module.css";

type BrandProfile = Awaited<ReturnType<typeof trpcClient.workspace.brandProfile.get.query>>;

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "competitors", label: "Competitors", icon: <span aria-hidden>◧</span>, href: "/competitors" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "brand", label: "Brand", icon: <span aria-hidden>◐</span>, href: "/brand", active: true },
  { id: "media", label: "Media", icon: <span aria-hidden>▦</span>, href: "/media" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
  { id: "billing", label: "Billing", icon: <span aria-hidden>$</span>, href: "/billing" },
  { id: "developers", label: "Developers", icon: <span aria-hidden>⌘</span>, href: "/developers" },
  { id: "notifications", label: "Notifications", icon: <span aria-hidden>◒</span>, href: "/notifications" },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings" },
];

function toLines(items: string[]): string {
  return items.join("\n");
}

function fromLines(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * A real gap found in a full-scope page audit: onboarding.ts writes the
 * first brand_profiles row and velocity.ts reads the latest one
 * internally for concept generation, but nothing ever let a user view or
 * edit it again — ugc.tsx's only way to reference a brand profile was a
 * raw pasted UUID. workspace.brandProfile.get/update (added alongside
 * this page) close that gap. `update` inserts a new version rather than
 * overwriting, matching brand_profiles' own versioned design.
 */
export default function BrandPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [profile, setProfile] = useState<BrandProfile | undefined>(undefined);
  const [product, setProduct] = useState("");
  const [category, setCategory] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [pains, setPains] = useState("");
  const [benefits, setBenefits] = useState("");
  const [differentiators, setDifferentiators] = useState("");
  const [ctaVariants, setCtaVariants] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await trpcClient.workspace.brandProfile.get.query();
    setProfile(result);
    if (result) {
      setProduct(result.product);
      setCategory(result.category);
      setOneLiner(result.oneLiner ?? "");
      setPains(toLines(result.pains as string[]));
      setBenefits(toLines(result.benefits as string[]));
      setDifferentiators(toLines(result.differentiators as string[]));
      setCtaVariants(toLines(result.ctaVariants as string[]));
    }
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load brand profile"));
  }, [currentWorkspaceId, load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await trpcClient.workspace.brandProfile.update.mutate({
        product,
        category,
        oneLiner: oneLiner || undefined,
        pains: fromLines(pains),
        benefits: fromLines(benefits),
        differentiators: fromLines(differentiators),
        ctaVariants: fromLines(ctaVariants),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save brand profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Brand
        </Text>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {!currentWorkspaceId || profile === undefined ? (
          <Text variant="body" as="p">
            Loading…
          </Text>
        ) : (
          <section className={styles.card}>
            <Text variant="label" as="p" className={styles.sectionLabel}>
              {profile ? `Version ${profile.version} · from ${profile.sourceUrl || "manual entry"}` : "No brand profile yet — fill this in to create your first version"}
            </Text>
            <div className={styles.form}>
              <label className={styles.fieldGroup}>
                <Text variant="label" as="span">
                  Product
                </Text>
                <input className={styles.input} value={product} onChange={(e) => setProduct(e.target.value)} />
              </label>
              <label className={styles.fieldGroup}>
                <Text variant="label" as="span">
                  Category
                </Text>
                <input className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} />
              </label>
              <label className={styles.fieldGroupWide}>
                <Text variant="label" as="span">
                  One-liner
                </Text>
                <input className={styles.input} value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} />
              </label>
              <label className={styles.fieldGroupWide}>
                <Text variant="label" as="span">
                  Pains (one per line)
                </Text>
                <textarea className={styles.textarea} rows={3} value={pains} onChange={(e) => setPains(e.target.value)} />
              </label>
              <label className={styles.fieldGroupWide}>
                <Text variant="label" as="span">
                  Benefits (one per line)
                </Text>
                <textarea className={styles.textarea} rows={3} value={benefits} onChange={(e) => setBenefits(e.target.value)} />
              </label>
              <label className={styles.fieldGroupWide}>
                <Text variant="label" as="span">
                  Differentiators (one per line)
                </Text>
                <textarea className={styles.textarea} rows={3} value={differentiators} onChange={(e) => setDifferentiators(e.target.value)} />
              </label>
              <label className={styles.fieldGroupWide}>
                <Text variant="label" as="span">
                  CTA variants (one per line)
                </Text>
                <textarea className={styles.textarea} rows={3} value={ctaVariants} onChange={(e) => setCtaVariants(e.target.value)} />
              </label>
              <button type="button" className={styles.actionButton} onClick={() => void handleSave()} disabled={saving || !product.trim() || !category.trim()}>
                {saving ? "Saving…" : profile ? "Save as new version" : "Create brand profile"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
