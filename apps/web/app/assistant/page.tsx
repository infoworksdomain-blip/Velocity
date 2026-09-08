"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { AppSidebar, Text, type SidebarItem } from "@velocity/ui";
import { useState } from "react";
import styles from "./assistant.module.css";

type ConversationTurn = Parameters<typeof trpcClient.growthBrain.assistant.chat.mutate>[0]["conversation"][number];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <span aria-hidden>◆</span>, href: "/dashboard" },
  { id: "velocity", label: "Velocity", icon: <span aria-hidden>▲</span>, href: "/velocity" },
  { id: "calendar", label: "Calendar", icon: <span aria-hidden>■</span>, href: "/calendar" },
  { id: "accounts", label: "Accounts", icon: <span aria-hidden>●</span>, href: "/accounts" },
  { id: "analytics", label: "Analytics", icon: <span aria-hidden>▲</span>, href: "/analytics" },
  { id: "assistant", label: "Assistant", icon: <span aria-hidden>✦</span>, href: "/assistant", active: true },
  { id: "ugc", label: "UGC Studio", icon: <span aria-hidden>★</span>, href: "/ugc" },
  { id: "automations", label: "Automation", icon: <span aria-hidden>⚙</span>, href: "/automations" },
];

/**
 * STEP 14's AI Assistant chat. The "AI ASSISTANT" badge on every one of
 * its own messages is the real, structural EU AI Act Art. 50(1)
 * disclosure the build script requires ("at the point of interaction —
 * in the interface, not in the terms") — it is part of the message
 * markup itself, not a one-time modal or a line buried in a ToS page.
 *
 * Conversation history lives only in this component's own state (a
 * real, contained STEP 14 scope trim — see docs/steps/STEP-14.md); the
 * server (`growthBrain.assistant.chat`) is stateless per call and takes
 * the full history back each time.
 */
export default function AssistantPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !currentWorkspaceId) return;
    setError(null);
    setSending(true);
    setDraft("");

    const nextConversation: ConversationTurn[] = [...conversation, { role: "user", content: text }];
    setConversation(nextConversation);

    try {
      const result = await trpcClient.growthBrain.assistant.chat.mutate({ conversation: nextConversation });
      setConversation(result.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The assistant failed to respond");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.shell}>
      <AppSidebar items={SIDEBAR_ITEMS} />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <Text variant="heading" as="h1">
            Assistant
          </Text>
          <span className={styles.aiBadge}>AI ASSISTANT</span>
        </div>

        <Text variant="body" as="p">
          Ask me to create content concepts, preview a schedule, or pull your performance analytics — I can only ever see and act on this workspace.
        </Text>

        {error && (
          <p role="alert">
            <Text variant="body" as="span">
              {error}
            </Text>
          </p>
        )}

        <div className={styles.thread}>
          {conversation
            .filter((turn) => turn.role === "user" || (turn.role === "assistant" && turn.content))
            .map((turn, i) => (
              <div key={i} className={turn.role === "user" ? styles.userBubble : styles.assistantBubble}>
                {turn.role === "assistant" && <span className={styles.aiBadgeSmall}>AI ASSISTANT</span>}
                <Text variant="body" as="p">
                  {turn.role === "user" ? turn.content : turn.content}
                </Text>
              </div>
            ))}
          {sending && (
            <div className={styles.assistantBubble}>
              <span className={styles.aiBadgeSmall}>AI ASSISTANT</span>
              <Text variant="body" as="p">
                Thinking…
              </Text>
            </div>
          )}
        </div>

        <div className={styles.composer}>
          <input
            className={styles.input}
            placeholder='e.g. "pull my analytics by platform"'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sending) void handleSend();
            }}
          />
          <button type="button" className={styles.sendButton} onClick={() => void handleSend()} disabled={sending || !draft.trim()}>
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
