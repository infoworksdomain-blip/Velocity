import type { Meta, StoryObj } from "@storybook/react";
import { BlitzCard } from "./BlitzCard";
import { BlitzDeck } from "./BlitzDeck";

const meta: Meta<typeof BlitzDeck> = {
  component: BlitzDeck,
  title: "AppShell/BlitzDeck",
};
export default meta;

type Story = StoryObj<typeof BlitzDeck>;

export const Default: Story = {
  args: {
    cards: [
      <BlitzCard key="1" media={<div style={{ width: "100%", height: "100%" }} />} angle="Pain-led" hook="You're losing customers at checkout" />,
      <BlitzCard key="2" media={<div style={{ width: "100%", height: "100%" }} />} angle="POV" hook="POV: you just found the tool you needed" />,
      <BlitzCard key="3" media={<div style={{ width: "100%", height: "100%" }} />} angle="Listicle" hook="3 reasons your team will love this" />,
    ],
  },
};
