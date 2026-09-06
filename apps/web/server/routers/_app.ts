import { router } from "../trpc";
import { authRouter } from "./auth";
import { dashboardRouter } from "./dashboard";
import { notificationsRouter } from "./notifications";
import { onboardingRouter } from "./onboarding";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
  auth: authRouter,
  workspace: workspaceRouter,
  onboarding: onboardingRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
