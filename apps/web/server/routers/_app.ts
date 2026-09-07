import { router } from "../trpc";
import { analyticsRouter } from "./analytics";
import { authRouter } from "./auth";
import { calendarRouter } from "./calendar";
import { contentRouter } from "./content";
import { dashboardRouter } from "./dashboard";
import { mediaRouter } from "./media";
import { notificationsRouter } from "./notifications";
import { growthBrainRouter } from "./growth-brain";
import { onboardingRouter } from "./onboarding";
import { publishRouter } from "./publish";
import { renderRouter } from "./render";
import { socialRouter } from "./social";
import { velocityRouter } from "./velocity";
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
  velocity: velocityRouter,
  calendar: calendarRouter,
  social: socialRouter,
  publish: publishRouter,
  analytics: analyticsRouter,
  growthBrain: growthBrainRouter,
});

export type AppRouter = typeof appRouter;
