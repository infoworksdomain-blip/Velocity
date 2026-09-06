import type { Meta, StoryObj } from "@storybook/react";
import { CalendarSlot } from "./CalendarSlot";

const meta: Meta<typeof CalendarSlot> = {
  component: CalendarSlot,
  title: "AppShell/CalendarSlot",
};
export default meta;

type Story = StoryObj<typeof CalendarSlot>;

export const Filled: Story = {
  args: { time: "9:00 AM", platform: "TikTok", thumbnail: <div style={{ width: "100%", height: "100%" }} /> },
};
export const Empty: Story = { args: { time: "2:00 PM", platform: "Open slot", empty: true } };
