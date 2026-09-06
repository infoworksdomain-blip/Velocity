import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof EmptyState> = {
  component: EmptyState,
  title: "AppShell/EmptyState",
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: {
    heading: "Your Blitz queue is empty",
    body: "Connect a brand profile and we'll generate your first batch of concepts.",
    ctaLabel: "Generate concepts",
  },
};
