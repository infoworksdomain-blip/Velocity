"use client";

import { trpcClient } from "@/lib/trpc-client";
import { useState } from "react";

/**
 * Functional shell — see ../login/page.tsx's doc comment. Unlike login/
 * signup, this doesn't need to set a cookie, so it calls authRouter.
 * requestPasswordReset directly through the tRPC client like every other
 * page in this app does.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await trpcClient.auth.requestPasswordReset.mutate({ email });
      // Always shows the same success message regardless of whether the
      // email matched an account — the router itself never leaks that
      // (see auth-service.ts), and the UI must not undo that by reacting
      // differently to a "not found" case it never actually receives.
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <p className="label">Reset your password</p>
      {submitted ? (
        <p>If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 15 minutes.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          <button type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </main>
  );
}
