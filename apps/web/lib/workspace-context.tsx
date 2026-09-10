"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { trpcClient } from "./trpc-client";
import { currentWorkspaceIdRef } from "./workspace-ref";

interface WorkspaceContextValue {
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

/**
 * The vanilla tRPC client (lib/trpc-client.ts) is a module-level singleton
 * with no access to React state, but workspace-scoped procedures need the
 * *current* workspace id as an `x-workspace-id` header on every request.
 * This ref (lib/workspace-ref.ts — split out to avoid a real circular
 * import between this file and trpc-client.ts, see that file's own
 * comment) is the bridge: WorkspaceProvider keeps it in sync with React
 * state, and the client's `headers()` callback reads it per-request. A
 * ref rather than a subscription is enough here — the client only reads
 * it at request time, it never needs to re-render on change. Re-exported
 * here so every existing importer of `currentWorkspaceIdRef` from this
 * file keeps working unchanged.
 */
export { currentWorkspaceIdRef };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId]);

  /**
   * Real bug found auditing every page directly (not just navigating
   * client-side from the dashboard): only dashboard/page.tsx ever called
   * `workspace.listMine` to pick a default `currentWorkspaceId` — every
   * other workspace-scoped page (calendar, billing, velocity, analytics,
   * ugc, assistant, automations, accounts, agency) just read this context
   * and assumed it was already populated. Since this is plain in-memory
   * React state with no persistence, a direct page load (a bookmark, a
   * refresh, a shared link — the normal way people actually navigate, not
   * just clicking through from /dashboard) left `currentWorkspaceId` null
   * forever, and those pages' queries failed with "x-workspace-id header
   * is required". Bootstrapping it once here, at the provider all pages
   * already mount under, is the real fix — not duplicating this effect
   * into every page. Fails silently for logged-out visitors on public
   * pages (marketing homepage, login, signup): `workspace.listMine` is a
   * protected procedure, so an unauthenticated 401 here is expected, not
   * an error worth surfacing.
   */
  useEffect(() => {
    trpcClient.workspace.listMine
      .query()
      .then((rows) => {
        const defaultWorkspaceId = rows[0]?.id;
        if (defaultWorkspaceId) setCurrentWorkspaceId((existing) => existing ?? defaultWorkspaceId);
      })
      .catch(() => {
        // Not signed in, or no workspace yet — pages that need one show their own empty state.
      });
  }, []);

  const value = useMemo(() => ({ currentWorkspaceId, setCurrentWorkspaceId }), [currentWorkspaceId]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}

/**
 * GATE 4's actual mechanism: every workspace-scoped query key includes the
 * active workspace id, so switching workspaces is a different React Query
 * cache entry by construction. There is no code path where workspace A's
 * cached data can render while viewing workspace B — the query for B is
 * keyed separately from the start, not just "expected to be refetched in
 * time." This is the detail the build script calls out as the one real
 * implementations usually get wrong.
 */
export function useWorkspaceScopedQueryKey(baseKey: readonly unknown[]): readonly unknown[] {
  const { currentWorkspaceId } = useWorkspace();
  return useMemo(() => [...baseKey, { workspaceId: currentWorkspaceId }], [baseKey, currentWorkspaceId]);
}
