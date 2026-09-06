"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceSwitcher as StyledWorkspaceSwitcher, type WorkspaceSummary } from "@velocity/ui";

export type { WorkspaceSummary };

/**
 * Wires STEP 4's workspace-context hook (the thing GATE 4's cache-isolation
 * test actually exercises) into STEP 7's styled presentational component.
 * Business logic stays here; visual design lives in packages/ui.
 */
export function WorkspaceSwitcher({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const { currentWorkspaceId, setCurrentWorkspaceId } = useWorkspace();
  return (
    <StyledWorkspaceSwitcher
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      onSelect={setCurrentWorkspaceId}
    />
  );
}
