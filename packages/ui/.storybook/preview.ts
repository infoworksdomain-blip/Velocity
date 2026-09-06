import type { Preview } from "@storybook/react";
import "../tokens/index.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "paper",
      values: [
        { name: "paper", value: "#FFFFFF" },
        { name: "paper-2", value: "#F7F6F4" },
        { name: "ember", value: "#0B0B0C" },
      ],
    },
  },
};

export default preview;
