import type { Meta, StoryObj } from "@storybook/react";
import { VelocityCard } from "./VelocityCard";

const meta: Meta<typeof VelocityCard> = {
  component: VelocityCard,
  title: "AppShell/VelocityCard",
};
export default meta;

type Story = StoryObj<typeof VelocityCard>;

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
