import type { Meta, StoryObj } from "@storybook/react";
import { DeviceFrame } from "./DeviceFrame";

const meta: Meta<typeof DeviceFrame> = {
  component: DeviceFrame,
  title: "Marketing/DeviceFrame",
};
export default meta;

type Story = StoryObj<typeof DeviceFrame>;

export const Default: Story = {
  args: {
    statChips: [
      { value: "2.4M", label: "Views" },
      { value: "12.8%", label: "CTR" },
    ],
    children: (
      <div style={{ width: "100%", height: "100%", background: "linear-gradient(160deg, var(--ember), var(--flare))" }} />
    ),
  },
};
