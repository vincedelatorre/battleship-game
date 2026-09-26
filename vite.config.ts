import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/",
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/engine/**/*.ts", "src/ai/**/*.ts"],
    },
  },
});
