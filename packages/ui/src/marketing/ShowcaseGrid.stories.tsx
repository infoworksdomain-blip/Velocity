import type { Meta, StoryObj } from "@storybook/react";
import { ShowcaseGrid } from "./ShowcaseGrid";

const meta: Meta<typeof ShowcaseGrid> = {
  component: ShowcaseGrid,
  title: "Marketing/ShowcaseGrid",
};
export default meta;

type Story = StoryObj<typeof ShowcaseGrid>;

export const Default: Story = {
  args: {
    items: [1, 2, 3, 4].map((n) => ({
      id: String(n),
      avatar: null,
      name: `Brand ${n}`,
      type: "E-commerce",
      metric: `${n * 3}.${n}M views`,
      media: null,
    })),
  },
};
