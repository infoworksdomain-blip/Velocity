import type { Meta, StoryObj } from "@storybook/react";
import { StatCard } from "./StatCard";

const meta: Meta<typeof StatCard> = {
  component: StatCard,
  title: "AppShell/StatCard",
};
export default meta;

type Story = StoryObj<typeof StatCard>;

export const Default: Story = {
  args: { label: "Views (7d)", value: "128.4K", trend: { direction: "up", label: "12% vs last week" } },
};
