import React, { useEffect } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/renderer/src/styles/tokens.css";
import "../src/renderer/src/styles/fonts.css";
import "../src/renderer/src/styles/ui.css";
import "../src/renderer/src/styles/editor.css";
import "../src/renderer/src/styles.css";

/**
 * Theme decorator: drives the same `data-theme` attribute the app uses, so
 * every token-driven component renders correctly in both modes via the
 * toolbar toggle.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string) ?? "light";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <div style={{ padding: 24, background: "var(--background-page)", color: "var(--foreground-primary)" }}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: "Design-token theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [withTheme],
};

export default preview;
