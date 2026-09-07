import type { Meta, StoryObj } from "@storybook/react";
import { VelocityCard } from "./VelocityCard";
import { VelocityDeck } from "./VelocityDeck";

const meta: Meta<typeof VelocityDeck> = {
  component: VelocityDeck,
  title: "AppShell/VelocityDeck",
};
export default meta;

type Story = StoryObj<typeof VelocityDeck>;

export const Default: Story = {
  args: {
    cards: [
      <VelocityCard key="1" media={<div style={{ width: "100%", height: "100%" }} />} angle="Pain-led" hook="You're losing customers at checkout" />,
      <VelocityCard key="2" media={<div style={{ width: "100%", height: "100%" }} />} angle="POV" hook="POV: you just found the tool you needed" />,
      <VelocityCard key="3" media={<div style={{ width: "100%", height: "100%" }} />} angle="Listicle" hook="3 reasons your team will love this" />,
    ],
  },
};
