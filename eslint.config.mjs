import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "app/storybook-static/**",
      "projects/**",
      "styles/**",
      ".whisper/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase deliberately uses `_`-prefixed placeholders (e.g. IPC `_event`).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Renderer: the rules-of-hooks guardrail (a hooks violation once blanked the editor).
    files: ["app/src/renderer/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    languageOptions: { globals: globals.browser },
  },
  {
    // Plain-Node ESM engine scripts and build helpers.
    files: ["app/scripts/**/*.mjs", "packages/edl/scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Main process / preload run in Node.
    files: ["app/src/main/**/*.ts", "app/src/preload/**/*.ts", "app/electron.vite.config.ts"],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
