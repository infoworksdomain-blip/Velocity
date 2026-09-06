import type { Meta, StoryObj } from "@storybook/react";
import { SpotlightBlock } from "./SpotlightBlock";

const meta: Meta<typeof SpotlightBlock> = {
  component: SpotlightBlock,
  title: "Marketing/SpotlightBlock",
};
export default meta;

type Story = StoryObj<typeof SpotlightBlock>;

export const Default: Story = {
  args: {
    label: "Blitz mode",
    heading: "Swipe through ideas, not renders",
    body: "Every concept costs a fraction of a penny until you swipe right — that's the only way the economics of 1,000s of content ideas actually work.",
    ctaLabel: "See Blitz in action",
    quote: { text: "It's the only tool where I'm not scared to say no to an idea.", source: "Early access customer" },
  },
};
