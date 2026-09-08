"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, Text, type SidebarItem } from "@velocity/ui";
import { useEffect, useState } from "react";
import styles from "./automations.module.css";

type Automation = Awaited<ReturnType<typeof trpcClient.automation.list.query>>[number];
type AgentRun = Awaited<ReturnType<typeof trpcClient.agents.runs.list.query>>[number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant" },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations", active: true },
  { id: "agency", label: "Agency", icon: <span aria-hidden>◈</span>, href: "/agency" },
];

/**
 * STEP 16's Automation Engine + AI Agents console — a real, functional
 * (not maximally polished) surface, consistent with the established
 * precedent for less-central screens (accounts, calendar). Automations
 * are created here as raw trigger/action JSON — a friendlier builder UI
 * is a real follow-up, not built in this pass (see docs/steps/STEP-16.md).
 */
export default function AutomationsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [name, setName] = useState("");
  const [triggerJson, setTriggerJson] = useState('{"kind":"low_queue","config":{"minReadyCount":10}}');
  const [actionJson, setActionJson] = useState('{"kind":"boost_winner_variants","config":{}}');
  const [isDryRun, setIsDryRun] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, string>>({});

  const [agentGoal, setAgentGoal] = useState("");
  const [agentSpendCap, setAgentSpendCap] = useState("10");
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);

  const refresh = async () => {
    if (!currentWorkspaceId) return;
    setAutomations(await trpcClient.automation.list.query());
    setAgentRuns(await trpcClient.agents.runs.list.query());
  };

  useEffect(() => {
    void refresh();
  }, [currentWorkspaceId]);

  const handleCreate = async () => {
    setError(null);
    try {
      const trigger = JSON.parse(triggerJson);
      const action = JSON.parse(actionJson);
      await trpcClient.automation.create.mutate({ name, trigger, action, spendCapUsd: null, isDryRun });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create automation");
    }
  };

  const handleRunNow = async (automationId: string) => {
    try {
      const result = await trpcClient.automation.runNow.mutate({ automationId });
      setRunResults((prev) => ({ ...prev, [automationId]: `${result.status}: ${result.reason}` }));
      await refresh();
    } catch (err) {
      setRunResults((prev) => ({ ...prev, [automationId]: err instanceof Error ? err.message : "Failed to run" }));
    }
  };

  const handleStartAgent = async () => {
    if (!agentGoal.trim()) return;
    setAgentBusy(true);
    setError(null);
    try {
      await trpcClient.agents.runs.start.mutate({ goal: agentGoal.trim(), spendCapUsd: Number(agentSpendCap) });
      setAgentGoal("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent run failed");
    } finally {
      setAgentBusy(false);
    }
  };

  const handleKillAgent = async (agentRunId: string) => {
    await trpcClient.agents.runs.kill.mutate({ agentRunId });
    await refresh();
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <Text variant="heading" as="h1">
          Automation
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
            Automations
          </Text>
          <Text variant="body" as="p">
            Trigger → condition → action, with dry-run mode and a per-automation spend cap. Every run — fired or skipped — is recorded.
          </Text>

          <ul className={styles.list}>
            {automations.map((a) => (
              <li key={a.id} className={styles.listItem}>
                <div>
                  <Text variant="body" as="span">
                    {a.name}
                  </Text>
                  {a.isDryRun && <span className={styles.badge}>DRY RUN</span>}
                </div>
                <button type="button" className={styles.actionButton} onClick={() => void handleRunNow(a.id)}>
                  Run now
                </button>
                {runResults[a.id] && (
                  <Text variant="body" as="p">
                    {runResults[a.id]}
                  </Text>
                )}
              </li>
            ))}
          </ul>

          <div className={styles.form}>
            <input className={styles.input} placeholder="Automation name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className={styles.checkboxLabel}>
              <input type="checkbox" checked={isDryRun} onChange={(e) => setIsDryRun(e.target.checked)} />
              Dry run
            </label>
            <textarea className={styles.textarea} rows={3} value={triggerJson} onChange={(e) => setTriggerJson(e.target.value)} placeholder="Trigger JSON" />
            <textarea className={styles.textarea} rows={3} value={actionJson} onChange={(e) => setActionJson(e.target.value)} placeholder="Action JSON" />
            <button type="button" className={styles.generateButton} onClick={() => void handleCreate()} disabled={!name.trim()}>
              Create automation
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <Text variant="heading" as="h2">
            AI Agents
          </Text>
          <Text variant="body" as="p">
            Goal-directed runs with a hard spend ceiling and a kill switch. No agent tool can publish to a real audience — every reachable tool only drafts, previews, or reads.
          </Text>

          <div className={styles.form}>
            <input className={styles.input} placeholder='Goal, e.g. "pull my analytics by platform"' value={agentGoal} onChange={(e) => setAgentGoal(e.target.value)} />
            <input className={styles.input} type="number" min="1" placeholder="Spend cap (USD)" value={agentSpendCap} onChange={(e) => setAgentSpendCap(e.target.value)} />
            <button type="button" className={styles.generateButton} onClick={() => void handleStartAgent()} disabled={agentBusy || !agentGoal.trim()}>
              {agentBusy ? "Running…" : "Start agent run"}
            </button>
          </div>

          <ul className={styles.list}>
            {agentRuns.map((run) => (
              <li key={run.id} className={styles.listItem}>
                <div>
                  <Text variant="body" as="span">
                    {run.goal}
                  </Text>
                  <span className={styles.badge}>{run.status.toUpperCase()}</span>
                </div>
                <Text variant="body" as="p">
                  Spend: ${run.spendUsd} / ${run.spendCapUsd}
                </Text>
                {run.status === "running" && (
                  <button type="button" className={styles.actionButton} onClick={() => void handleKillAgent(run.id)}>
                    Kill
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
