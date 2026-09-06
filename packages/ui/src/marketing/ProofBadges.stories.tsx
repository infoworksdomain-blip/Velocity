import type { Meta, StoryObj } from "@storybook/react";
import { ProofBadges } from "./ProofBadges";

const meta: Meta<typeof ProofBadges> = {
  component: ProofBadges,
  title: "Marketing/ProofBadges",
};
export default meta;

type Story = StoryObj<typeof ProofBadges>;

export const Default: Story = {
  args: {
    badges: [
      { value: "50,000+", label: "Businesses" },
      { value: "1,000+", label: "AI UGC characters" },
      { value: "25,000+", label: "Trending blueprints" },
    ],
  },
};
