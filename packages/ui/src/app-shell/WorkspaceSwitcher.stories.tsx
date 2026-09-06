import type { Meta, StoryObj } from "@storybook/react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const meta: Meta<typeof WorkspaceSwitcher> = {
  component: WorkspaceSwitcher,
  title: "AppShell/WorkspaceSwitcher",
};
export default meta;

type Story = StoryObj<typeof WorkspaceSwitcher>;

export const Default: Story = {
  args: {
    workspaces: [
      { id: "a", name: "Demo Workspace" },
      { id: "b", name: "Client Co." },
    ],
    currentWorkspaceId: "a",
    onSelect: () => {},
  },
};
