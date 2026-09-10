"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, EmptyState, Text, type SidebarItem } from "@velocity/ui";
import { useCallback, useEffect, useState } from "react";
import styles from "./developers.module.css";

type ApiKey = Awaited<ReturnType<typeof trpcClient.apiKeys.list.query>>[number];
type Webhook = Awaited<ReturnType<typeof trpcClient.webhooks.list.query>>[number];
type Delivery = Awaited<ReturnType<typeof trpcClient.webhooks.deliveries.list.query>>[number];

const WEBHOOK_EVENTS = [
  "render.completed",
  "render.failed",
  "text.generated",
  "publication.succeeded",
  "publication.failed",
  "concept.batch_ready",
  "quota.threshold",
  "credits.low",
  "account.token_expiring",
] as const;

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
  { id: "developers", label: "Developers", icon: <span aria-hidden>⌘</span>, href: "/developers", active: true },
  { id: "notifications", label: "Notifications", icon: <span aria-hidden>◒</span>, href: "/notifications" },
  { id: "settings", label: "Settings", icon: <span aria-hidden>◎</span>, href: "/settings" },
];

/**
 * A real gap found in a full-scope page audit: STEP 16's Public API and
 * webhook system (api-keys.ts, webhooks.ts) are real, tested, end-to-end —
 * sign, deliver, verify, retry, exhaust, replay — but nothing ever gave a
 * workspace a way to actually create the key or register the endpoint
 * that whole pipeline depends on. Both a raw API key and a webhook
 * signing secret are shown exactly once, in the create response — never
 * again — matching what api-keys.ts/webhooks.ts's own doc comments
 * already guarantee server-side.
 */
export default function DevelopersPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [apiKeys, setApiKeys] = useState<ApiKey[] | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [newScopes, setNewScopes] = useState("content:read");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [keys, hooks, deliveryRows] = await Promise.all([trpcClient.apiKeys.list.query(), trpcClient.webhooks.list.query(), trpcClient.webhooks.deliveries.list.query()]);
    setApiKeys(keys);
    setWebhooks(hooks);
    setDeliveries(deliveryRows);
  }, []);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setError(null);
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load developer settings"));
  }, [currentWorkspaceId, load]);

  const handleCreateKey = async () => {
    setError(null);
    try {
      const scopes = newScopes.split(",").map((s) => s.trim()).filter(Boolean);
      const result = await trpcClient.apiKeys.create.mutate({ scopes });
      setRevealedKey(result.rawKey);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  const handleRevokeKey = async (apiKeyId: string) => {
    await trpcClient.apiKeys.revoke.mutate({ apiKeyId });
    await load();
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });
  };

  const handleCreateWebhook = async () => {
    if (!webhookUrl.trim() || selectedEvents.size === 0) return;
    setError(null);
    try {
      const result = await trpcClient.webhooks.create.mutate({ url: webhookUrl.trim(), events: [...selectedEvents] as (typeof WEBHOOK_EVENTS)[number][] });
      setRevealedSecret(result.secret);
      setWebhookUrl("");
      setSelectedEvents(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    await trpcClient.webhooks.delete.mutate({ webhookId });
    await load();
  };

  const handleReplay = async (deliveryId: string) => {
    await trpcClient.webhooks.deliveries.replay.mutate({ deliveryId });
    await load();
  };

  const deliveryStatus = (delivery: Delivery): "delivered" | "exhausted" | "pending" => {
    if (delivery.deliveredAt) return "delivered";
    if (delivery.nextRetryAt === null && delivery.attemptCount > 0) return "exhausted";
    return "pending";
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Developers
        </Text>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        {!currentWorkspaceId ? (
          <Text variant="body" as="p">
            Loading…
          </Text>
        ) : (
          <>
            <section className={styles.card}>
              <Text variant="label" as="p" className={styles.sectionLabel}>
                API keys
              </Text>

              {revealedKey && (
                <p role="alert" className={styles.revealBox}>
                  <Text variant="body" as="span">
                    Copy this now — it won&rsquo;t be shown again: <code>{revealedKey}</code>
                  </Text>
                </p>
              )}

              {apiKeys !== null && apiKeys.length === 0 && <EmptyState heading="No API keys yet" body="Create one below to call the public /v1 API." />}

              {apiKeys !== null && apiKeys.length > 0 && (
                <div className={styles.list}>
                  {apiKeys.map((key) => (
                    <div key={key.id} className={styles.row}>
                      <Text variant="body" as="span">
                        {(key.scopes as string[]).join(", ")}
                      </Text>
                      <Text variant="label" as="span" className={styles.meta}>
                        {new Date(key.createdAt).toLocaleDateString()}
                      </Text>
                      <button type="button" className={styles.dangerButton} onClick={() => void handleRevokeKey(key.id)}>
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.form}>
                <input className={styles.input} placeholder="content:read, content:create" value={newScopes} onChange={(e) => setNewScopes(e.target.value)} />
                <button type="button" className={styles.actionButton} onClick={() => void handleCreateKey()}>
                  Create key
                </button>
              </div>
            </section>

            <section className={styles.card}>
              <Text variant="label" as="p" className={styles.sectionLabel}>
                Webhooks
              </Text>

              {revealedSecret && (
                <p role="alert" className={styles.revealBox}>
                  <Text variant="body" as="span">
                    Signing secret — copy this now, it won&rsquo;t be shown again: <code>{revealedSecret}</code>
                  </Text>
                </p>
              )}

              {webhooks !== null && webhooks.length === 0 && <EmptyState heading="No webhooks yet" body="Register an endpoint below to receive real-time events." />}

              {webhooks !== null && webhooks.length > 0 && (
                <div className={styles.list}>
                  {webhooks.map((hook) => (
                    <div key={hook.id} className={styles.row}>
                      <Text variant="body" as="span">
                        {hook.url}
                      </Text>
                      <Text variant="label" as="span" className={styles.meta}>
                        {(hook.events as string[]).join(", ")}
                      </Text>
                      <button type="button" className={styles.dangerButton} onClick={() => void handleDeleteWebhook(hook.id)}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.webhookForm}>
                <input className={styles.input} placeholder="https://yourapp.com/webhooks/velocity" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
                <div className={styles.eventGrid}>
                  {WEBHOOK_EVENTS.map((event) => (
                    <label key={event} className={styles.eventLabel}>
                      <input type="checkbox" checked={selectedEvents.has(event)} onChange={() => toggleEvent(event)} />
                      <Text variant="label" as="span">
                        {event}
                      </Text>
                    </label>
                  ))}
                </div>
                <button type="button" className={styles.actionButton} onClick={() => void handleCreateWebhook()} disabled={!webhookUrl.trim() || selectedEvents.size === 0}>
                  Register webhook
                </button>
              </div>
            </section>

            {deliveries.length > 0 && (
              <section className={styles.card}>
                <Text variant="label" as="p" className={styles.sectionLabel}>
                  Recent deliveries
                </Text>
                <div className={styles.list}>
                  {deliveries.slice(0, 20).map((delivery) => (
                    <div key={delivery.id} className={styles.row}>
                      <Text variant="body" as="span">
                        {delivery.event}
                      </Text>
                      <Text variant="label" as="span" className={styles.meta}>
                        {deliveryStatus(delivery)}
                      </Text>
                      {deliveryStatus(delivery) === "exhausted" && (
                        <button type="button" className={styles.actionButtonSmall} onClick={() => void handleReplay(delivery.id)}>
                          Replay
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
