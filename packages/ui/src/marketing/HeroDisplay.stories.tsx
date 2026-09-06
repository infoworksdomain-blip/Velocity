import type { Meta, StoryObj } from "@storybook/react";
import { HeroDisplay } from "./HeroDisplay";

const meta: Meta<typeof HeroDisplay> = {
  component: HeroDisplay,
  title: "Marketing/HeroDisplay",
};
export default meta;

type Story = StoryObj<typeof HeroDisplay>;

export const Default: Story = {
  args: {
    headline: (
      <>
        Your website, <em>reimagined</em> as content
      </>
    ),
    subhead: "Paste a URL. Get short-form video, scheduled and published — with growth data feeding back into what comes next.",
    primaryCtaLabel: "Start free",
    secondaryCtaLabel: "See how it works",
  },
};
