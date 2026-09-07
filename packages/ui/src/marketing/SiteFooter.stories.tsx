import type { Meta, StoryObj } from "@storybook/react";
import { SiteFooter } from "./SiteFooter";

const meta: Meta<typeof SiteFooter> = {
  component: SiteFooter,
  title: "Marketing/SiteFooter",
};
export default meta;

type Story = StoryObj<typeof SiteFooter>;

export const Default: Story = {
  args: {
    wordmark: "VELOCITY",
    columns: [
      { heading: "Product", links: [{ label: "Velocity", href: "#" }, { label: "Pricing", href: "#" }] },
      { heading: "Company", links: [{ label: "About", href: "#" }] },
      { heading: "Resources", links: [{ label: "Docs", href: "#" }] },
      { heading: "Legal", links: [{ label: "Privacy", href: "#" }] },
    ],
  },
};
