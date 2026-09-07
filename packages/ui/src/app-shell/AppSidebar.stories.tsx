import type { Meta, StoryObj } from "@storybook/react";
import { AppSidebar } from "./AppSidebar";

const meta: Meta<typeof AppSidebar> = {
  component: AppSidebar,
  title: "AppShell/AppSidebar",
};
export default meta;

type Story = StoryObj<typeof AppSidebar>;

export const Default: Story = {
  args: {
    items: [
      { id: "dashboard", label: "Dashboard", icon: "◧", href: "#", active: true },
      { id: "velocity", label: "Velocity", icon: "⚡", href: "#" },
      { id: "calendar", label: "Calendar", icon: "▦", href: "#" },
      { id: "analytics", label: "Analytics", icon: "📈", href: "#" },
    ],
  },
};
