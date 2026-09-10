"use client";

import { trpcClient } from "@/lib/trpc-client";
import { useWorkspace } from "@/lib/workspace-context";
import { AppSidebar, Text, type SidebarItem } from "@velocity/ui";
import { useEffect, useState } from "react";
import styles from "./billing.module.css";

type BillingPlan = Awaited<ReturnType<typeof trpcClient.billing.plans.query>>[number];
type Subscription = Awaited<ReturnType<typeof trpcClient.billing.currentSubscription.query>>;
type Invoice = Awaited<ReturnType<typeof trpcClient.billing.invoices.query>>[number];

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
  { id: "billing", label: "Billing", icon: <span aria-hidden>$</span>, href: "/billing", active: true },
  { id: "developers", label: "Developers", icon: <span aria-hidden>⌘</span>, href: "/developers" },
  { id: "notifications", label: "Notifications", icon: <span aria-hidden>◒</span>, href: "/notifications" },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings" },
];

const TOP_UP_PACKS = [
  { key: "small" as const, label: "500 credits — $10" },
  { key: "medium" as const, label: "2,500 credits — $40" },
  { key: "large" as const, label: "6,000 credits — $80" },
];

/**
 * STEP 19's Billing page — real, functional, not maximally polished (the
 * same precedent as accounts/agency/admin). Upgrade/downgrade/cancel and
 * payment-method changes go through Stripe's own real Billing Portal
 * (billing-service.ts's own doc comment on why this page doesn't
 * reimplement that UI); this page's job is plan comparison, the current
 * subscription/credit-balance readout, top-up purchases, and invoice
 * history.
 */
export default function BillingPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [plansResult, subscriptionResult, balanceResult, invoicesResult] = await Promise.all([
        trpcClient.billing.plans.query(),
        trpcClient.billing.currentSubscription.query(),
        trpcClient.billing.creditBalance.query(),
        trpcClient.billing.invoices.query(),
      ]);
      setPlans(plansResult);
      setSubscription(subscriptionResult);
      setCreditBalance(balanceResult);
      setInvoices(invoicesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing data");
    }
  };

  useEffect(() => {
    if (!currentWorkspaceId) return;
    void refresh();
  }, [currentWorkspaceId]);

  const handleSubscribe = async (planKey: "starter" | "growth" | "pro") => {
    setError(null);
    try {
      const { checkoutUrl } = await trpcClient.billing.checkout.subscription.mutate({ planKey, successUrl: `${window.location.origin}/billing?checkout=success`, cancelUrl: `${window.location.origin}/billing?checkout=cancel` });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    }
  };

  const handleTopUp = async (packKey: "small" | "medium" | "large") => {
    setError(null);
    try {
      const { checkoutUrl } = await trpcClient.billing.checkout.topUp.mutate({ packKey, successUrl: `${window.location.origin}/billing?checkout=success`, cancelUrl: `${window.location.origin}/billing?checkout=cancel` });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    }
  };

  const handleManageBilling = async () => {
    setError(null);
    try {
      const { portalUrl } = await trpcClient.billing.portalSession.mutate({ returnUrl: window.location.href });
      window.location.href = portalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open the billing portal — subscribe to a paid plan first");
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Billing
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
            Current plan
          </Text>
          <Text variant="body" as="p">
            {subscription ? `${subscription.planKey} — ${subscription.status}` : "Free plan (no active subscription)"}
          </Text>
          <Text variant="body" as="p">
            Credit balance: {creditBalance}
          </Text>
          {subscription && (
            <button type="button" className={styles.actionButton} onClick={() => void handleManageBilling()}>
              Manage billing (Stripe portal)
            </button>
          )}
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Plans
          </Text>
          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <div key={plan.key} className={subscription?.planKey === plan.key ? styles.planCardActive : styles.planCard}>
                <Text variant="body" as="span">
                  {plan.name}
                </Text>
                <Text variant="body" as="p">
                  ${plan.monthlyPriceUsd}/mo — {plan.creditAllowance} credits — {plan.seatLimit} seats
                </Text>
                {plan.key !== "free" && subscription?.planKey !== plan.key && (
                  <button type="button" className={styles.generateButton} onClick={() => void handleSubscribe(plan.key as "starter" | "growth" | "pro")}>
                    Subscribe
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Credit top-ups
          </Text>
          <ul className={styles.list}>
            {TOP_UP_PACKS.map((pack) => (
              <li key={pack.key} className={styles.listItem}>
                <Text variant="body" as="span">
                  {pack.label}
                </Text>
                <button type="button" className={styles.actionButton} onClick={() => void handleTopUp(pack.key)}>
                  Buy
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            Invoices
          </Text>
          <ul className={styles.list}>
            {invoices.map((invoice) => (
              <li key={invoice.id} className={styles.listItem}>
                <Text variant="body" as="span">
                  ${invoice.amountUsd} — {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : "not yet issued"}
                </Text>
                <span className={styles.badge}>{invoice.status.toUpperCase()}</span>
              </li>
            ))}
            {invoices.length === 0 && (
              <Text variant="body" as="p">
                No invoices yet.
              </Text>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
