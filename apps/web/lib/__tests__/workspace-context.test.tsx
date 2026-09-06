import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useWorkspace, useWorkspaceScopedQueryKey, WorkspaceProvider } from "../workspace-context";

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </QueryClientProvider>
    );
  };
}

function useHarness() {
  const workspace = useWorkspace();
  const queryKey = useWorkspaceScopedQueryKey(["profile"]);
  const query = useQuery({
    queryKey,
    queryFn: () => Promise.resolve(`data-for-${workspace.currentWorkspaceId}`),
    enabled: workspace.currentWorkspaceId !== null,
  });
  return { workspace, query };
}

/**
 * GATE 4: "switching context never leaks cached data across the boundary
 * — test the React Query cache specifically, it is the usual culprit."
 * This runs for real in this environment — no backend needed, since it's
 * testing the query-key discipline itself.
 */
describe("workspace-scoped React Query cache isolation (GATE 4)", () => {
  it("never serves one workspace's cached data while viewing another", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useHarness(), { wrapper: createWrapper(queryClient) });

    act(() => result.current.workspace.setCurrentWorkspaceId("workspace-a"));
    await waitFor(() => expect(result.current.query.data).toBe("data-for-workspace-a"));

    // Simulate workspace B already having a cached entry from a previous visit.
    queryClient.setQueryData(["profile", { workspaceId: "workspace-b" }], "cached-data-for-workspace-b");

    act(() => result.current.workspace.setCurrentWorkspaceId("workspace-b"));
    // Immediately after switching — before any refetch settles — this must
    // never be workspace A's data. A shared/unscoped key would fail this
    // assertion by serving the stale previous value.
    expect(result.current.query.data).not.toBe("data-for-workspace-a");
    await waitFor(() => expect(result.current.query.data).toBe("cached-data-for-workspace-b"));

    act(() => result.current.workspace.setCurrentWorkspaceId("workspace-a"));
    // Switching back must not have evicted A's own cache entry, and must
    // never show B's data while viewing A.
    await waitFor(() => expect(result.current.query.data).toBe("data-for-workspace-a"));
    expect(result.current.query.data).not.toBe("cached-data-for-workspace-b");
  });

  it("produces a distinct cache key per workspace", () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => {
        const workspace = useWorkspace();
        const key = useWorkspaceScopedQueryKey(["profile"]);
        return { workspace, key };
      },
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.workspace.setCurrentWorkspaceId("workspace-a"));
    const keyA = result.current.key;

    act(() => result.current.workspace.setCurrentWorkspaceId("workspace-b"));
    const keyB = result.current.key;

    expect(keyA).not.toEqual(keyB);
  });
});
