import { describe, expect, it } from "vitest";

import { RULES } from "../src/engine/rules";

describe("RULES", () => {
  it("defines the classic 10x10 board", () => {
    expect(RULES).toEqual({ rows: 10, cols: 10 });
    expect(RULES.rows).toBe(10);
    expect(RULES.cols).toBe(10);
  });
});
