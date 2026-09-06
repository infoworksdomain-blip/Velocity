import { router } from "../trpc";
import { authRouter } from "./auth";
import { onboardingRouter } from "./onboarding";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
  auth: authRouter,
  workspace: workspaceRouter,
  onboarding: onboardingRouter,
});

export type AppRouter = typeof appRouter;
