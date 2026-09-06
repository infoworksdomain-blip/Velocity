import type { Meta, StoryObj } from "@storybook/react";
import { FloatingNav } from "./FloatingNav";

const meta: Meta<typeof FloatingNav> = {
  component: FloatingNav,
  title: "Marketing/FloatingNav",
};
export default meta;

type Story = StoryObj<typeof FloatingNav>;

export const Default: Story = {
  args: {
    logo: "VELOCITY",
    ctaLabel: "Get started",
    links: [
      { label: "Product", href: "#product" },
      { label: "Pricing", href: "#pricing" },
      { label: "Customers", href: "#customers" },
    ],
  },
};
