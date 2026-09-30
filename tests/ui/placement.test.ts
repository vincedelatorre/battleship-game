import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/engine/rng";
import { shipCells, validateFleet } from "../../src/engine/placement";
import { FLEET } from "../../src/engine/rules";
import { anchoredPlacement, createPlacement } from "../../src/ui/battle/placement";

describe("anchoredPlacement", () => {
  it("centres the ship on the hovered square", () => {
    expect(anchoredPlacement("carrier", { row: 4, col: 5 }, "H")).toEqual({
      id: "carrier", orientation: "H", row: 4, col: 3,
    });
    expect(anchoredPlacement("cruiser", { row: 4, col: 5 }, "V")).toEqual({
      id: "cruiser", orientation: "V", row: 3, col: 5,
    });
  });

  it("clamps every ship fully onto the board, both orientations, from any square", () => {
    for (const spec of FLEET) {
      for (const o of ["H", "V"] as const) {
        for (let row = -2; row < 12; row++) {
          for (let col = -2; col < 12; col++) {
            const p = anchoredPlacement(spec.id, { row, col }, o);
            for (const c of shipCells(p)) {
              expect(c.row).toBeGreaterThanOrEqual(0);
              expect(c.row).toBeLessThan(10);
              expect(c.col).toBeGreaterThanOrEqual(0);
              expect(c.col).toBeLessThan(10);
              expect(Number.isInteger(c.row) && Number.isInteger(c.col)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("snaps fractional pointer squares to whole squares", () => {
    const p = anchoredPlacement("destroyer", { row: 2.6, col: 7.4 }, "H");
    expect(p).toEqual({ id: "destroyer", orientation: "H", row: 3, col: 7 });
  });
});

describe("placement controller", () => {
  it("starts with the Man-o'-War selected, horizontal, nothing placed", () => {
    const pc = createPlacement(mulberry32(1));
    expect(pc.selected()).toBe("carrier");
    expect(pc.orientation()).toBe("H");
    expect(pc.placed()).toEqual([]);
    expect(pc.complete()).toBe(false);
    expect(pc.preview()).toBeNull();
  });

  it("places ships one by one, auto-selecting the next, and completes at five", () => {
    const pc = createPlacement(mulberry32(1));
    const rows = [0, 2, 4, 6, 8];
    for (const [i, row] of rows.entries()) {
      expect(pc.selected()).toBe(FLEET[i]!.id);
      expect(pc.click({ row, col: 4 })).toBe("placed");
    }
    expect(pc.complete()).toBe(true);
    expect(pc.selected()).toBeNull();
    expect(validateFleet(pc.placed()).ok).toBe(true);
  });

  it("rotates between horizontal and vertical only", () => {
    const pc = createPlacement(mulberry32(1));
    pc.rotate();
    expect(pc.orientation()).toBe("V");
    pc.rotate();
    expect(pc.orientation()).toBe("H");
  });

  it("previews overlap as invalid (engine error) and refuses to place there", () => {
    const pc = createPlacement(mulberry32(1));
    pc.click({ row: 5, col: 5 }); // carrier H at F4..F8
    pc.rotate(); // battleship vertical through the carrier
    pc.hover({ row: 5, col: 7 });
    const pv = pc.preview()!;
    expect(pv.valid).toBe(false);
    expect(pv.error).toBe("overlap");
    expect(pc.click({ row: 4, col: 0 })).toBe("placed"); // elsewhere is fine
  });

  it("lifts a placed ship back up when you click it", () => {
    const pc = createPlacement(mulberry32(1));
    pc.click({ row: 0, col: 4 }); // carrier
    pc.rotate();
    pc.click({ row: 5, col: 9 }); // battleship V
    // now the cruiser is selected; clicking the carrier where the cruiser
    // can't fit picks the carrier up instead
    pc.rotate(); // cruiser H over the carrier row → overlap
    expect(pc.click({ row: 0, col: 3 })).toBe("picked");
    expect(pc.selected()).toBe("carrier");
    expect(pc.orientation()).toBe("H");
    expect(pc.placed().map((p) => p.id)).toEqual(["battleship"]);
  });

  it("selecting a placed ship from the dock lifts it off the board", () => {
    const pc = createPlacement(mulberry32(1));
    pc.click({ row: 0, col: 4 });
    pc.select("carrier");
    expect(pc.placed()).toEqual([]);
    expect(pc.selected()).toBe("carrier");
  });

  it("randomize fills a legal fleet; clear empties it", () => {
    const pc = createPlacement(mulberry32(9));
    pc.randomize();
    expect(pc.complete()).toBe(true);
    expect(validateFleet(pc.placed()).ok).toBe(true);
    pc.clear();
    expect(pc.placed()).toEqual([]);
    expect(pc.selected()).toBe("carrier");
  });

  it("reports the ship under a square", () => {
    const pc = createPlacement(mulberry32(1));
    pc.click({ row: 3, col: 3 });
    expect(pc.shipAt({ row: 3, col: 1 })?.id).toBe("carrier");
    expect(pc.shipAt({ row: 4, col: 1 })).toBeUndefined();
  });
});
