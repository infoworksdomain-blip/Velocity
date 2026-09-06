import type { Meta, StoryObj } from "@storybook/react";
import { SafeAreaOverlay } from "./SafeAreaOverlay";

const meta: Meta<typeof SafeAreaOverlay> = {
  component: SafeAreaOverlay,
  title: "AppShell/SafeAreaOverlay",
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 270, aspectRatio: "9 / 16", background: "var(--paper-2)" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof SafeAreaOverlay>;

export const TikTok: Story = {
  args: { platformLabel: "TikTok", insets: { top: 180, bottom: 500, left: 40, right: 220 } },
};

export const Shorts: Story = {
  args: { platformLabel: "YouTube Shorts", insets: { top: 140, bottom: 320, left: 40, right: 180 } },
};
