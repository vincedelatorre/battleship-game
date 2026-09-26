import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules",
      "dist",
      "coverage",
      "public",
      "docs",
      "scripts",
      "review-shots",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,js}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // No cheating, by construction: AI code may never import game state.
    // simulate.ts is the referee and is exempt.
    files: ["src/ai/**/*.ts"],
    ignores: ["src/ai/simulate.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/engine/types", "**/engine", "**/engine/index"],
              importNames: ["GameState", "PlayerState"],
              message:
                "AI code may not see game state; build Knowledge from GameEvents.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,js}", "*.config.{ts,js}"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
