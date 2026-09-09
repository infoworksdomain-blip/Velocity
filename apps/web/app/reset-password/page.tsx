"use client";

import { trpcClient } from "@/lib/trpc-client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

/** Functional shell — see ../login/page.tsx's doc comment. The token comes from the ?token= query param authRouter.requestPasswordReset's email link points at. */
function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await trpcClient.auth.resetPassword.mutate({ token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <p role="alert">This reset link is missing its token — request a new one from the forgot-password page.</p>;
  }

  if (done) {
    return (
      <p>
        Your password has been reset. <Link href="/login">Log in</Link>
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <p role="alert">{error}</p>}
      <input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min. 8 characters)" autoComplete="new-password" />
      <button type="submit" disabled={submitting}>
        {submitting ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main>
      <p className="label">Set a new password</p>
      <Suspense fallback={<p>Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
