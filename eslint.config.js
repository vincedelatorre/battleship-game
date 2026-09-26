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
    files: ["tests/**/*.{ts,js}", "*.config.{ts,js}"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
