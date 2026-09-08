import { router } from "../trpc";
import { adminRouter } from "./admin";
import { agencyRouter } from "./agency";
import { agentsRouter } from "./agents";
import { analyticsRouter } from "./analytics";
import { apiKeysRouter } from "./api-keys";
import { automationRouter } from "./automation";
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
import { ugcRouter } from "./ugc";
import { velocityRouter } from "./velocity";
import { webhooksRouter } from "./webhooks";
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
  ugc: ugcRouter,
  automation: automationRouter,
  agents: agentsRouter,
  webhooks: webhooksRouter,
  apiKeys: apiKeysRouter,
  agency: agencyRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
