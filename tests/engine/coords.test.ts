import { describe, expect, it } from "vitest";

import {
  coordKey,
  coordLabel,
  inBounds,
  orthogonalNeighbors,
  parseLabel,
  sameCoord,
} from "../../src/engine/coords";
import { RULES } from "../../src/engine/rules";

describe("coordLabel / parseLabel", () => {
  it("round-trips all 100 cells", () => {
    for (let row = 0; row < RULES.rows; row++) {
      for (let col = 0; col < RULES.cols; col++) {
        const c = { row, col };
        expect(parseLabel(coordLabel(c))).toEqual(c);
      }
    }
  });

  it("uses classic A-J / 1-10 notation", () => {
    expect(coordLabel({ row: 0, col: 0 })).toBe("A1");
    expect(coordLabel({ row: 1, col: 6 })).toBe("B7");
    expect(coordLabel({ row: 9, col: 9 })).toBe("J10");
  });

  it.each(["K1", "A11", "", "a0", "A0", "A1 "])("rejects %j", (s) => {
    expect(parseLabel(s)).toBeNull();
  });
});

describe("inBounds / sameCoord / coordKey", () => {
  it("bounds the 10x10 grid", () => {
    expect(inBounds({ row: 0, col: 0 })).toBe(true);
    expect(inBounds({ row: 9, col: 9 })).toBe(true);
    expect(inBounds({ row: -1, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: -1 })).toBe(false);
    expect(inBounds({ row: 10, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: 10 })).toBe(false);
  });

  it("compares and keys coordinates", () => {
    expect(sameCoord({ row: 1, col: 2 }, { row: 1, col: 2 })).toBe(true);
    expect(sameCoord({ row: 1, col: 2 }, { row: 2, col: 1 })).toBe(false);
    expect(coordKey({ row: 3, col: 4 })).toBe("3,4");
  });
});

describe("orthogonalNeighbors", () => {
  it("returns 4 neighbors for an interior cell", () => {
    expect(orthogonalNeighbors({ row: 5, col: 5 })).toEqual([
      { row: 4, col: 5 },
      { row: 6, col: 5 },
      { row: 5, col: 4 },
      { row: 5, col: 6 },
    ]);
  });

  it("clips to 3 neighbors on an edge", () => {
    expect(orthogonalNeighbors({ row: 0, col: 5 })).toEqual([
      { row: 1, col: 5 },
      { row: 0, col: 4 },
      { row: 0, col: 6 },
    ]);
    expect(orthogonalNeighbors({ row: 5, col: 9 })).toEqual([
      { row: 4, col: 9 },
      { row: 6, col: 9 },
      { row: 5, col: 8 },
    ]);
  });

  it("clips to 2 neighbors at a corner", () => {
    expect(orthogonalNeighbors({ row: 0, col: 0 })).toEqual([
      { row: 1, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(orthogonalNeighbors({ row: 9, col: 9 })).toEqual([
      { row: 8, col: 9 },
      { row: 9, col: 8 },
    ]);
  });
});
