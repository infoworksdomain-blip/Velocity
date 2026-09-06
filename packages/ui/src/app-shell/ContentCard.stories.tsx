import type { Meta, StoryObj } from "@storybook/react";
import { ContentCard } from "./ContentCard";

const meta: Meta<typeof ContentCard> = {
  component: ContentCard,
  title: "AppShell/ContentCard",
};
export default meta;

type Story = StoryObj<typeof ContentCard>;

export const Default: Story = {
  args: {
    thumbnail: <div style={{ width: "100%", height: "100%", background: "var(--paper-2)" }} />,
    hook: "The one mistake killing your conversion rate",
    state: "Scheduled",
  },
};
