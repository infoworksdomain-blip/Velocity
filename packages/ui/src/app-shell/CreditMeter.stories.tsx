import type { Meta, StoryObj } from "@storybook/react";
import { CreditMeter } from "./CreditMeter";

const meta: Meta<typeof CreditMeter> = {
  component: CreditMeter,
  title: "AppShell/CreditMeter",
};
export default meta;

type Story = StoryObj<typeof CreditMeter>;

export const Healthy: Story = { args: { balance: 340, limit: 500 } };
export const Low: Story = { args: { balance: 42, limit: 500 } };
