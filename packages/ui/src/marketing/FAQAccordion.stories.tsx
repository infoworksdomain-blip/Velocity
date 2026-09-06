import type { Meta, StoryObj } from "@storybook/react";
import { FAQAccordion } from "./FAQAccordion";

const meta: Meta<typeof FAQAccordion> = {
  component: FAQAccordion,
  title: "Marketing/FAQAccordion",
};
export default meta;

type Story = StoryObj<typeof FAQAccordion>;

export const Default: Story = {
  args: {
    items: [
      { id: "1", question: "Does this post automatically?", answer: "Only after you approve — every AI-persona post requires human approval before publish." },
      { id: "2", question: "Which platforms are supported?", answer: "TikTok, Instagram Reels, and YouTube Shorts, via each platform's official API." },
    ],
  },
};
