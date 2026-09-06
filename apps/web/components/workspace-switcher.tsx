"use client";

import { useWorkspace } from "@/lib/workspace-context";

export interface WorkspaceSummary {
  id: string;
  name: string;
}

/**
 * Functional only — Appendix A's actual visual design (floating pill chrome
 * etc.) lands in STEP 7. This exists so the cache-isolation property GATE 4
 * requires is a real, testable component, not a UI polish exercise.
 */
export function WorkspaceSwitcher({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const { currentWorkspaceId, setCurrentWorkspaceId } = useWorkspace();

  return (
    <select
      aria-label="Switch workspace"
      value={currentWorkspaceId ?? ""}
      onChange={(event) => setCurrentWorkspaceId(event.target.value)}
    >
      <option value="" disabled>
        Select a workspace
      </option>
      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
        </option>
      ))}
    </select>
  );
}
