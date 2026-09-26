import { defineConfig } from "vitest/config";

/**
 * Balance simulation (requirements §1A.6): runs tests/balance/*.sim.ts,
 * excluded from the normal suite. No coverage, generous timeout — this
 * plays ~20,000 games.
 */
export default defineConfig({
  test: {
    include: ["tests/balance/**/*.sim.ts"],
    environment: "node",
    testTimeout: 900_000,
  },
});
