import type { Meta, StoryObj } from "@storybook/react";
import { TimelineEditor } from "./TimelineEditor";

const meta: Meta<typeof TimelineEditor> = {
  component: TimelineEditor,
  title: "AppShell/TimelineEditor",
};
export default meta;

type Story = StoryObj<typeof TimelineEditor>;

export const Default: Story = {
  args: {
    durationLabel: "0:18",
    markers: [
      { id: "hook", label: "Hook", startPct: 0, widthPct: 15 },
      { id: "beat1", label: "Beat 1", startPct: 15, widthPct: 35 },
      { id: "cta", label: "CTA", startPct: 85, widthPct: 15 },
    ],
  },
};
