import type { Meta, StoryObj } from "@storybook/react";
import { BlitzCard } from "./BlitzCard";

const meta: Meta<typeof BlitzCard> = {
  component: BlitzCard,
  title: "AppShell/BlitzCard",
};
export default meta;

type Story = StoryObj<typeof BlitzCard>;

export const Default: Story = {
  args: {
    media: <div style={{ width: "100%", height: "100%" }} />,
    angle: "Pain-led",
    hook: "You're losing customers at checkout — here's why",
  },
};

export const Dragging: Story = {
  args: { ...Default.args, dragX: 80 },
};
