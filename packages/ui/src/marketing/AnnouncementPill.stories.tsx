import type { Meta, StoryObj } from "@storybook/react";
import { AnnouncementPill } from "./AnnouncementPill";

const meta: Meta<typeof AnnouncementPill> = {
  component: AnnouncementPill,
  title: "Marketing/AnnouncementPill",
};
export default meta;

type Story = StoryObj<typeof AnnouncementPill>;

export const Default: Story = {
  args: { badge: "New", text: "Live with API, MCP and Skill" },
};
