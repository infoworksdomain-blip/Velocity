"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { trpcClient } from "@/lib/trpc-client";
import { Text } from "@velocity/ui";
import { useEffect, useState } from "react";
import styles from "./portal.module.css";

type Concept = Awaited<ReturnType<typeof trpcClient.content.concepts.list.query>>[number];

/**
 * The Client Portal (build script: "read-only or approval-only branded
 * surface"). Deliberately has NO sidebar — this is the branded, external-
 * facing surface a client-role user sees, not the full internal
 * dashboard shell. Reuses the real `client` workspace role STEP 3
 * already seeded (permissions: content:read:workspace, client_portal:
 * approve:workspace, analytics:read:workspace) — a user with that role
 * can load this page and see their own workspace's content, nothing
 * more, the same RLS-backed workspace scoping every other page relies on.
 *
 * Scope decision (see docs/steps/STEP-17.md): this pass builds the real
 * READ-ONLY half. `client_portal:approve:workspace` is a real, pre-
 * existing permission in the catalogue, but no NEW distinct client-
 * approval action is wired to it here — the existing swipe-right/
 * calendar-commit approval flows already satisfy C7, and inventing a
 * second, semantically-unclear "client sign-off" field without a
 * concrete design brief was judged worse than leaving it honestly
 * unbuilt for a later pass to design properly.
 */
export default function ClientPortalPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [concepts, setConcepts] = useState<Concept[]>([]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    trpcClient.content.concepts.list.query().then(setConcepts).catch(() => setConcepts([]));
  }, [currentWorkspaceId]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Text variant="heading" as="h1">
          Your content
        </Text>
        <Text variant="body" as="p">
          A read-only view of what your team is creating and publishing.
        </Text>
      </header>

      <main className={styles.main}>
        <ul className={styles.list}>
          {concepts.map((c) => (
            <li key={c.id} className={styles.listItem}>
              <Text variant="body" as="span">
                {c.hook}
              </Text>
              <span className={styles.badge}>{c.format.toUpperCase().replace("_", " ")}</span>
            </li>
          ))}
          {concepts.length === 0 && (
            <Text variant="body" as="p">
              Nothing here yet.
            </Text>
          )}
        </ul>
      </main>
    </div>
  );
}
