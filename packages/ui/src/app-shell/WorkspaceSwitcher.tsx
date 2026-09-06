import { Text } from "../primitives/Text";
import styles from "./WorkspaceSwitcher.module.css";

export interface WorkspaceSummary {
  id: string;
  name: string;
}

export interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
}

/** Presentational only — apps/web/lib/workspace-context.tsx owns the actual current-workspace state and query-key scoping (GATE 4). */
export function WorkspaceSwitcher({ workspaces, currentWorkspaceId, onSelect }: WorkspaceSwitcherProps) {
  return (
    <label className={styles.switcher}>
      <Text variant="label" as="span" className={styles.hiddenLabel}>
        Switch workspace
      </Text>
      <select
        className={styles.select}
        value={currentWorkspaceId ?? ""}
        onChange={(event) => onSelect(event.target.value)}
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
    </label>
  );
}
