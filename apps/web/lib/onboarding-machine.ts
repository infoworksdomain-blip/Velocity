"use client";

// Imported from the "@velocity/core/onboarding" subpath, not the package
// root: the root barrel also re-exports the auth module (bcrypt, jose,
// otpauth — some of it touching node:crypto), and pulling that into a
// client component's bundle breaks webpack outright ("node:crypto" has no
// browser scheme handler). The subpath export in packages/core/package.json
// exists specifically so browser-safe modules can be imported without
// dragging the server-only ones along.
import { nextOnboardingStage, type OnboardingEvent, type OnboardingStage } from "@velocity/core/onboarding";
import { useCallback, useState } from "react";

export function useOnboardingMachine(initial: OnboardingStage = "choose_type") {
  const [stage, setStage] = useState<OnboardingStage>(initial);
  const dispatch = useCallback((event: OnboardingEvent) => {
    setStage((current) => nextOnboardingStage(current, event));
  }, []);
  return { stage, dispatch };
}
