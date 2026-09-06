import type { Meta, StoryObj } from "@storybook/react";
import { PricingTier } from "./PricingTier";

const meta: Meta<typeof PricingTier> = {
  component: PricingTier,
  title: "Marketing/PricingTier",
};
export default meta;

type Story = StoryObj<typeof PricingTier>;

export const Standard: Story = {
  args: {
    name: "Starter",
    price: "$29",
    features: ["250 AI Studio credits", "20 content saves", "1 workspace"],
    ctaLabel: "Choose Starter",
  },
};

export const Recommended: Story = {
  args: {
    name: "Growth",
    price: "$49",
    features: ["500 AI Studio credits", "100 content saves", "3 workspaces", "Unlimited socials"],
    ctaLabel: "Choose Growth",
    recommended: true,
  },
};
