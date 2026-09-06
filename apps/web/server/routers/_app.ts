import { router } from "../trpc";
import { authRouter } from "./auth";
import { workspaceRouter } from "./workspace";

export const appRouter = router({
  auth: authRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
