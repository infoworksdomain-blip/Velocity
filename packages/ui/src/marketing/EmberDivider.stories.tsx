import type { Meta, StoryObj } from "@storybook/react";
import { EmberDivider } from "./EmberDivider";

const meta: Meta<typeof EmberDivider> = {
  component: EmberDivider,
  title: "Marketing/EmberDivider",
};
export default meta;

type Story = StoryObj<typeof EmberDivider>;

export const Default: Story = {};
