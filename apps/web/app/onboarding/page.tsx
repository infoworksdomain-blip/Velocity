"use client";

import { useOnboardingMachine } from "@/lib/onboarding-machine";
import { trpcClient } from "@/lib/trpc-client";
import type { BrandProfileDraft, ConceptDraft } from "@velocity/providers";
import { useState } from "react";

/**
 * Functional shell only — Appendix A's actual visual design is STEP 7's
 * job. This page exists to prove the onboarding state machine and its
 * tRPC procedures wire together, not as the shipped UI.
 *
 * Known limitation: `onboarding.complete` requires an authenticated
 * session (a workspace needs a real owning user). This page does not
 * fold account creation into the flow — where exactly that happens
 * (before `enter_url`? at `pick_goals`?) is a UX decision for STEP 7's
 * design pass, not a technical gap in the state machine itself.
 */
export default function OnboardingPage() {
  const { stage, dispatch } = useOnboardingMachine();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [workspaceType, setWorkspaceType] = useState<"individual" | "business">("individual");
  const [url, setUrl] = useState("");
  const [brandProfile, setBrandProfile] = useState<BrandProfileDraft | null>(null);
  const [goals, setGoals] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<ConceptDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function guarded(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <main>
      <p className="label">STEP 5 — onboarding shell (functional only, STEP 7 owns the design)</p>
      <p>Stage: {stage}</p>
      {error && <p role="alert">{error}</p>}

      {stage === "choose_type" && (
        <section>
          <select value={workspaceType} onChange={(e) => setWorkspaceType(e.target.value as typeof workspaceType)}>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
          </select>
          <button
            onClick={() =>
              guarded(async () => {
                const result = await trpcClient.onboarding.start.mutate({ workspaceType });
                setSessionId(result.sessionId);
                dispatch({ type: "TYPE_CHOSEN" });
              })
            }
          >
            Continue
          </button>
        </section>
      )}

      {stage === "enter_url" && (
        <section>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourbusiness.com" />
          <button
            onClick={() =>
              guarded(async () => {
                if (!sessionId) throw new Error("Missing session — restart onboarding");
                dispatch({ type: "URL_SUBMITTED" });
                const result = await trpcClient.onboarding.analyzeWebsite.mutate({ sessionId, url });
                setBrandProfile(result.brandProfile);
                dispatch({ type: "ANALYSIS_COMPLETE" });
              })
            }
          >
            Analyze
          </button>
        </section>
      )}

      {stage === "analyzing" && <p>Analyzing your website…</p>}

      {stage === "confirm_profile" && brandProfile && (
        <section>
          <p>{brandProfile.oneLiner}</p>
          <ul>
            {brandProfile.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
          <button
            onClick={() =>
              guarded(async () => {
                if (!sessionId) throw new Error("Missing session — restart onboarding");
                await trpcClient.onboarding.confirmProfile.mutate({ sessionId });
                dispatch({ type: "PROFILE_CONFIRMED" });
              })
            }
          >
            Looks right
          </button>
        </section>
      )}

      {stage === "pick_goals" && (
        <section>
          <input value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Comma-separated goals (up to 3)" />
          <button
            onClick={() =>
              guarded(async () => {
                if (!sessionId) throw new Error("Missing session — restart onboarding");
                const goalList = goals.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 3);
                await trpcClient.onboarding.pickGoals.mutate({ sessionId, goals: goalList });
                dispatch({ type: "GOALS_PICKED" });
              })
            }
          >
            Continue
          </button>
        </section>
      )}

      {stage === "connect_social" && (
        <section>
          <button
            onClick={() =>
              guarded(async () => {
                if (!sessionId) throw new Error("Missing session — restart onboarding");
                await trpcClient.onboarding.connectSocial.mutate({ sessionId, skipped: true });
                dispatch({ type: "SOCIAL_SKIPPED" });
              })
            }
          >
            Skip for now
          </button>
        </section>
      )}

      {stage === "done" && !workspaceId && (
        <button
          onClick={() =>
            guarded(async () => {
              if (!sessionId || !brandProfile) throw new Error("Missing session — restart onboarding");
              const result = await trpcClient.onboarding.complete.mutate({
                sessionId,
                name: brandProfile.product,
                workspaceType,
                brandProfile,
              });
              setWorkspaceId(result.workspaceId);
              setConcepts(result.concepts);
            })
          }
        >
          Finish setup (requires being signed in)
        </button>
      )}

      {workspaceId && (
        <section>
          <p>Workspace created: {workspaceId}</p>
          <ul>
            {concepts.map((concept) => (
              <li key={concept.hook}>{concept.hook}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
