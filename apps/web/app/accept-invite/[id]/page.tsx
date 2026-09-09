"use client";

import { trpcClient } from "@/lib/trpc-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

/**
 * Functional shell — see ../../login/page.tsx's doc comment. Post-STEP-22
 * audit remediation: workspace.ts's acceptInvitation mutation (STEP 4) has
 * existed since STEP 4 with no page anywhere ever calling it — the
 * invitation's own id doubles as the accept token (no separate token
 * column on the invitations table), matching the link
 * workspace-service.ts's sendInvitationNotification now actually emails.
 * Requires an existing session (acceptInvitation is a protectedProcedure)
 * — an invitee with no account yet needs to sign up first, then return to
 * this same link.
 */
export default function AcceptInvitePage() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  async function accept() {
    setStatus("accepting");
    setError(null);
    try {
      const result = await trpcClient.workspace.members.acceptInvitation.mutate({ invitationId: id });
      setWorkspaceId(result.workspaceId);
      setStatus("accepted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <main>
      <p className="label">Workspace invitation</p>
      {status === "accepted" ? (
        <p>
          You&apos;ve joined the workspace{workspaceId ? ` (${workspaceId})` : ""}. <Link href="/dashboard">Go to dashboard</Link>
        </p>
      ) : (
        <>
          {error && (
            <p role="alert">
              {error}. If you don&apos;t have an account yet, <Link href="/signup">sign up</Link> first, then open this link again.
            </p>
          )}
          <button onClick={accept} disabled={status === "accepting"}>
            {status === "accepting" ? "Joining…" : "Accept invitation"}
          </button>
        </>
      )}
    </main>
  );
}
