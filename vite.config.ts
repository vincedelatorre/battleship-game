import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/",
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/engine/**/*.ts", "src/ai/**/*.ts"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
