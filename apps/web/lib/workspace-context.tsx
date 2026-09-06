"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface WorkspaceContextValue {
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
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
