import type { Meta, StoryObj } from "@storybook/react";
import { FeatureCard } from "./FeatureCard";

const meta: Meta<typeof FeatureCard> = {
  component: FeatureCard,
  title: "Marketing/FeatureCard",
};
export default meta;

type Story = StoryObj<typeof FeatureCard>;

export const Default: Story = {
  args: {
    media: <div style={{ width: "100%", height: "100%" }} />,
    heading: "AI UGC in your brand voice",
    copy: "Persona-consistent talking-head videos generated from your product facts, not generic scripts.",
  },
};
