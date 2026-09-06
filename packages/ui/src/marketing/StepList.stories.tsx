import type { Meta, StoryObj } from "@storybook/react";
import { StepList } from "./StepList";

const meta: Meta<typeof StepList> = {
  component: StepList,
  title: "Marketing/StepList",
};
export default meta;

type Story = StoryObj<typeof StepList>;

export const Default: Story = {
  args: {
    steps: [
      { number: "01", heading: "Enter your URL", copy: "We learn your product, audience, and tone in seconds." },
      { number: "02", heading: "Blitz", copy: "Swipe through concepts built from your own brand." },
      { number: "03", heading: "Fill your calendar", copy: "One click schedules 30 days of posts." },
      { number: "04", heading: "Track growth", copy: "See which posts actually drove signups and sales." },
    ],
  },
};
