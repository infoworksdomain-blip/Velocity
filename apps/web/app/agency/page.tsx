"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, Text, type SidebarItem } from "@velocity/ui";
import { useEffect, useState } from "react";
import styles from "./agency.module.css";

type ManagedWorkspace = Awaited<ReturnType<typeof trpcClient.agency.managedWorkspaces.query>>[number];
type Creator = Awaited<ReturnType<typeof trpcClient.agency.creators.list.query>>[number];
type Engagement = Awaited<ReturnType<typeof trpcClient.agency.engagements.list.query>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency", active: true },
];

/**
 * STEP 17's Agency console: cross-workspace management (reusing the real
 * agency_manager membership STEP 3 already seeded), plus the Creator
 * Marketplace. Real, functional, not maximally polished — the same
 * precedent as accounts/calendar/UGC Studio. White-label branding is
 * managed here too (a real "manage my agency's brand" surface), but the
 * actual custom-domain resolution is proven server-side (agency-
 * service.test.ts), not exercised through this UI in this pass.
 */
export default function AgencyPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [managedWorkspaces, setManagedWorkspaces] = useState<ManagedWorkspace[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [creatorName, setCreatorName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");
  const [creatorRate, setCreatorRate] = useState("");

  const [briefCreatorId, setBriefCreatorId] = useState("");
  const [briefText, setBriefText] = useState("");
  const [briefRate, setBriefRate] = useState("");

  const refresh = async () => {
    setManagedWorkspaces(await trpcClient.agency.managedWorkspaces.query());
    setCreators(await trpcClient.agency.creators.list.query());
    if (currentWorkspaceId) setEngagements(await trpcClient.agency.engagements.list.query());
  };

  useEffect(() => {
    void refresh();
  }, [currentWorkspaceId]);

  const handleCreateCreator = async () => {
    if (!creatorName.trim() || !creatorEmail.trim()) return;
    setError(null);
    try {
      await trpcClient.agency.creators.create.mutate({ displayName: creatorName.trim(), email: creatorEmail.trim(), rateUsd: creatorRate ? Number(creatorRate) : undefined });
      setCreatorName("");
      setCreatorEmail("");
      setCreatorRate("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add creator");
    }
  };

  const handleCreateEngagement = async () => {
    if (!briefCreatorId || !briefText.trim() || !briefRate) return;
    setError(null);
    try {
      await trpcClient.agency.engagements.create.mutate({ creatorId: briefCreatorId, briefText: briefText.trim(), rateUsd: Number(briefRate) });
      setBriefText("");
      setBriefRate("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create engagement");
    }
  };

  const handleAccept = async (engagementId: string, rateUsd: string) => {
    await trpcClient.agency.engagements.accept.mutate({ engagementId, fundAmountUsd: Number(rateUsd) });
    await refresh();
  };
  const handleDeliver = async (engagementId: string) => {
    await trpcClient.agency.engagements.deliver.mutate({ engagementId, deliverableStorageKey: `deliverables/${engagementId}.mp4` });
    await refresh();
  };
  const handleConfirmDisclosureAndApprove = async (engagementId: string) => {
    await trpcClient.agency.engagements.confirmPaidPartnershipDisclosure.mutate({ engagementId });
    await trpcClient.agency.engagements.approve.mutate({ engagementId });
    await refresh();
  };
  const handlePay = async (engagementId: string) => {
    await trpcClient.agency.engagements.pay.mutate({ engagementId });
    await refresh();
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Agency
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
            Managed workspaces
          </Text>
          <Text variant="body" as="p">
            Every workspace where you hold the agency manager role — a real cross-client console, not a separate login per client.
          </Text>
          <ul className={styles.list}>
            {managedWorkspaces.map((w) => (
              <li key={w.workspaceId} className={styles.listItem}>
                <Text variant="body" as="span">
                  {w.workspaceName}
                </Text>
                {w.budgetCapUsd && (
                  <Text variant="body" as="p">
                    Budget: ${w.budgetCapUsd} · Margin: {w.marginPercent}%
                  </Text>
                )}
              </li>
            ))}
            {managedWorkspaces.length === 0 && (
              <Text variant="body" as="p">
                No managed client workspaces yet.
              </Text>
            )}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Creator Marketplace
          </Text>

          <Text variant="body" as="p">
            Creators
          </Text>
          <ul className={styles.list}>
            {creators.map((c) => (
              <li key={c.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  {c.displayName} ({c.email}) {c.rateUsd ? `— $${c.rateUsd}` : ""}
                </Text>
                {c.identityVerifiedAt ? <span className={styles.badge}>VERIFIED</span> : <span className={styles.badge}>UNVERIFIED</span>}
              </li>
            ))}
          </ul>
          <div className={styles.form}>
            <input className={styles.input} placeholder="Creator name" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} />
            <input className={styles.input} placeholder="Email" value={creatorEmail} onChange={(e) => setCreatorEmail(e.target.value)} />
            <input className={styles.input} type="number" placeholder="Rate (USD)" value={creatorRate} onChange={(e) => setCreatorRate(e.target.value)} />
            <button type="button" className={styles.actionButton} onClick={() => void handleCreateCreator()}>
              Add creator
            </button>
          </div>

          <Text variant="body" as="p">
            Engagements
          </Text>
          <ul className={styles.list}>
            {engagements.map((e) => (
              <li key={e.id} className={styles.listItem}>
                <div>
                  <Text variant="body" as="span">
                    {e.briefText}
                  </Text>
                  <span className={styles.badge}>{e.status.toUpperCase()}</span>
                </div>
                <div className={styles.form}>
                  {e.status === "briefed" && (
                    <button type="button" className={styles.actionButton} onClick={() => void handleAccept(e.id, e.rateUsd)}>
                      Accept &amp; fund escrow
                    </button>
                  )}
                  {e.status === "accepted" && (
                    <button type="button" className={styles.actionButton} onClick={() => void handleDeliver(e.id)}>
                      Mark delivered
                    </button>
                  )}
                  {e.status === "delivered" && (
                    <button type="button" className={styles.actionButton} onClick={() => void handleConfirmDisclosureAndApprove(e.id)}>
                      Confirm disclosure &amp; approve
                    </button>
                  )}
                  {e.status === "approved" && (
                    <button type="button" className={styles.actionButton} onClick={() => void handlePay(e.id)}>
                      Pay creator
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.form}>
            <select className={styles.input} value={briefCreatorId} onChange={(e) => setBriefCreatorId(e.target.value)}>
              <option value="">Select a creator…</option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <input className={styles.input} placeholder="Brief" value={briefText} onChange={(e) => setBriefText(e.target.value)} />
            <input className={styles.input} type="number" placeholder="Rate (USD)" value={briefRate} onChange={(e) => setBriefRate(e.target.value)} />
            <button type="button" className={styles.generateButton} onClick={() => void handleCreateEngagement()}>
              Send brief
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
