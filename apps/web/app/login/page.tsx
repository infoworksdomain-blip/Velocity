"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Functional shell only, matching STEP 5's onboarding page's own
 * precedent ("Appendix A's actual visual design is [a later] job. This
 * page exists to prove [the flow] wires together, not as the shipped
 * UI"). Post-STEP-22 audit remediation: no login page existed anywhere in
 * this app before this — auth was tRPC-mutation-only and unreachable from
 * a browser. Posts to /api/auth/login (not the tRPC client directly)
 * because only a plain Route Handler can set the httpOnly session cookie
 * context.ts reads — see server/auth-cookie.ts.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Login failed");
        return;
      }
      window.location.href = "/dashboard";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <p className="label">Log in</p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={onSubmit}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p>
        No account? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
