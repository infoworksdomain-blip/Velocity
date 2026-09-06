import type { Meta, StoryObj } from "@storybook/react";
import { CalendarGrid } from "./CalendarGrid";

const meta: Meta<typeof CalendarGrid> = {
  component: CalendarGrid,
  title: "AppShell/CalendarGrid",
};
export default meta;

type Story = StoryObj<typeof CalendarGrid>;

export const Default: Story = {
  args: {
    weekdayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    days: Array.from({ length: 14 }, (_, i) => ({ date: i + 1, isToday: i === 4, slots: [] })),
  },
};
