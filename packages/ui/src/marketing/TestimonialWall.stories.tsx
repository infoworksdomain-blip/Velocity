import type { Meta, StoryObj } from "@storybook/react";
import { TestimonialWall } from "./TestimonialWall";

const meta: Meta<typeof TestimonialWall> = {
  component: TestimonialWall,
  title: "Marketing/TestimonialWall",
};
export default meta;

type Story = StoryObj<typeof TestimonialWall>;

export const Default: Story = {
  args: {
    testimonials: [
      { id: "1", quote: "We went from zero to a full calendar in a single afternoon.", source: "@northwind" },
      { id: "2", quote: "The hook variants alone paid for the plan.", source: "@acme" },
      { id: "3", quote: "Velocity is genuinely the fastest review loop I've used.", source: "@globex" },
    ],
  },
};
