import type { Meta, StoryObj } from "@storybook/react";
import { AccountChip } from "./AccountChip";

const meta: Meta<typeof AccountChip> = {
  component: AccountChip,
  title: "AppShell/AccountChip",
};
export default meta;

type Story = StoryObj<typeof AccountChip>;

export const Healthy: Story = {
  args: { avatar: null, platformMark: "T", handle: "@brand.tiktok", health: "healthy" },
};
export const NeedsReconnect: Story = {
  args: { avatar: null, platformMark: "I", handle: "@brand.ig", health: "error" },
};
