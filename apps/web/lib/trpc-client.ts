import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers/_app";

/**
 * Vanilla tRPC client (not the React Query hooks integration — that's
 * more wiring than STEP 5's stub-backed flow justifies right now). Enough
 * to prove the client/server contract compiles and works; STEP 7's design
 * system pass is a natural point to reconsider whether `@trpc/react-query`
 * earns its place once there are many more screens calling this API.
 */
export const trpcClient = createTRPCProxyClient<AppRouter>({
  transformer: superjson,
  links: [httpBatchLink({ url: "/api/trpc" })],
});
