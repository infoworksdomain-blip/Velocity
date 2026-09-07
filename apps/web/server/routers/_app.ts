import { router } from "../trpc";
import { authRouter } from "./auth";
import { contentRouter } from "./content";
import { dashboardRouter } from "./dashboard";
import { mediaRouter } from "./media";
import { notificationsRouter } from "./notifications";
import { onboardingRouter } from "./onboarding";
import { renderRouter } from "./render";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
  auth: authRouter,
  workspace: workspaceRouter,
  onboarding: onboardingRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
  content: contentRouter,
  render: renderRouter,
  media: mediaRouter,
});

export type AppRouter = typeof appRouter;
