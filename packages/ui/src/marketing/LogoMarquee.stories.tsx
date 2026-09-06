import type { Meta, StoryObj } from "@storybook/react";
import { LogoMarquee } from "./LogoMarquee";

const meta: Meta<typeof LogoMarquee> = {
  component: LogoMarquee,
  title: "Marketing/LogoMarquee",
};
export default meta;

type Story = StoryObj<typeof LogoMarquee>;

export const Default: Story = {
  args: {
    logos: ["Northwind", "Acme", "Globex", "Initech", "Umbrella", "Hooli"].map((name) => ({
      name,
      mark: name,
    })),
  },
};
