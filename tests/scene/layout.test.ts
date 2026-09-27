import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CELL,
  GRID_CELLS,
  GRID_SIZE,
  cellToWorld,
  gridBounds,
  gridCenterX,
  gridLineWorldPositions,
  placementTransform,
  SHIP_BEAM,
  SHIP_LEN_MARGIN,
  SHIP_SWAY_MAX,
  spriteUnitsPerPixel,
  worldToCell,
} from "../../src/scene/board/layout";
import { shipCells } from "../../src/engine/placement";

describe("board layout", () => {
  it("puts the grids side by side at x=∓24, z=0, with an 8u gap", () => {
    expect(gridCenterX("player")).toBe(-24);
    expect(gridCenterX("enemy")).toBe(24);
    expect(gridBounds("player").maxX).toBe(-4);
    expect(gridBounds("enemy").minX).toBe(4);
    expect(gridBounds("player").minZ).toBe(-20);
    expect(gridBounds("enemy").maxZ).toBe(20);
    expect(GRID_SIZE).toBe(40);
    expect(CELL).toBe(4);
    expect(GRID_CELLS).toBe(10);
  });

  it("maps A1 to the far-left cell of a grid and J10 to near-right", () => {
    expect(cellToWorld("player", { row: 0, col: 0 })).toEqual({ x: -42, z: -18 });
    expect(cellToWorld("player", { row: 9, col: 9 })).toEqual({ x: -6, z: 18 });
    expect(cellToWorld("enemy", { row: 0, col: 0 })).toEqual({ x: 6, z: -18 });
    expect(cellToWorld("enemy", { row: 9, col: 9 })).toEqual({ x: 42, z: 18 });
  });

  it("round-trips cellToWorld/worldToCell for every cell", () => {
    for (const g of ["player", "enemy"] as const) {
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const w = cellToWorld(g, { row: r, col: c });
          expect(worldToCell(g, w.x, w.z)).toEqual({ row: r, col: c });
        }
      }
    }
  });

  it("returns null outside the grid and does not confuse the two grids", () => {
    expect(worldToCell("player", 0, 0)).toBeNull(); // the gap
    expect(worldToCell("player", 0, 30)).toBeNull();
    expect(worldToCell("enemy", -10, 0)).toBeNull();
    const w = cellToWorld("enemy", { row: 9, col: 9 });
    expect(worldToCell("player", w.x, w.z)).toBeNull();
  });

  it("centres a horizontal ship across its cells with bow toward +x", () => {
    const t = placementTransform("player", {
      id: "destroyer",
      row: 9,
      col: 0,
      orientation: "H",
    });
    // cells J1,J2: x centres -42,-38 → centre -40; row 9 → z 18
    expect(t.x).toBeCloseTo(-40);
    expect(t.z).toBeCloseTo(18);
    expect(t.yaw).toBe(0);
    expect(t.spanCells).toBe(2);
  });

  it("rotates a vertical ship to bow +z", () => {
    const p = { id: "submarine" as const, row: 0, col: 0, orientation: "V" as const };
    const t = placementTransform("enemy", p);
    const cells = shipCells(p);
    expect(t.spanCells).toBe(cells.length);
    expect(t.yaw).toBeCloseTo(-Math.PI / 2);
    expect(t.z).toBeCloseTo(-14); // rows A,B,C centred at z -18,-14,-10 → -14
  });
});

describe("grid line positions", () => {
  it("11 lines per axis per grid, CELL-stepped, matching the bounds", () => {
    for (const g of ["player", "enemy"] as const) {
      const { x, z } = gridLineWorldPositions(g);
      const b = gridBounds(g);
      expect(x).toHaveLength(GRID_CELLS + 1);
      expect(z).toHaveLength(GRID_CELLS + 1);
      expect(x[0]).toBe(b.minX);
      expect(x[GRID_CELLS]).toBe(b.maxX);
      expect(z[0]).toBe(b.minZ);
      expect(z[GRID_CELLS]).toBe(b.maxZ);
      for (let i = 1; i <= GRID_CELLS; i++) {
        expect(x[i]! - x[i - 1]!).toBe(CELL);
        expect(z[i]! - z[i - 1]!).toBe(CELL);
      }
      // cell centres sit exactly between adjacent lines
      for (let cIdx = 0; cIdx < GRID_CELLS; cIdx++) {
        const w = cellToWorld(g, { row: 0, col: cIdx });
        expect(w.x).toBeCloseTo((x[cIdx]! + x[cIdx + 1]!) / 2, 9);
      }
    }
  });
});

describe("sprite footprint", () => {
  interface Meta { w: number; h: number; hullCx: number; hullCy: number }
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../public/assets/ships/manifest.json", import.meta.url).pathname,
      "utf8",
    ),
  ) as Record<string, Meta>;
  const SHIP_CELLS: Record<string, number> = {
    carrier: 5, battleship: 4, cruiser: 3, submarine: 3, destroyer: 2,
  };

  it("every sprite sits inside its cells: full length ≤ cells×4−0.5, beam ≤ 4×0.82", () => {
    for (const [key, m] of Object.entries(manifest)) {
      const id = key.split("/")[1]!;
      const cells = SHIP_CELLS[id]!;
      const { kx, ky } = spriteUnitsPerPixel(cells, m.w, m.h, m.hullCx, m.hullCy);
      // farthest pixel each side of the hull centre stays inside the margin
      const lenL = 2 * Math.max(m.hullCx, 1 - m.hullCx) * m.w * kx;
      const beam = 2 * Math.max(m.hullCy, 1 - m.hullCy) * m.h * ky;
      expect(lenL, `${key} length`).toBeCloseTo(cells * CELL - SHIP_LEN_MARGIN, 5);
      expect(beam, `${key} beam`).toBeLessThanOrEqual(SHIP_BEAM + 1e-9);
      const len = m.w * kx;   // full sprite bounds, pennants included
      expect(len).toBeLessThanOrEqual(lenL); // pennant side never sticks out farther
      // animation extremes: yaw sway rotates the xz footprint — the
      // worst-case bounds must still not cross a grid line
      const c = Math.cos(SHIP_SWAY_MAX), s = Math.sin(SHIP_SWAY_MAX);
      const lenX = len * c + beam * s;
      const beamX = beam * c + len * s;
      expect(lenX, `${key} swayed length`).toBeLessThanOrEqual(cells * CELL + 1e-9);
      expect(beamX, `${key} swayed beam`).toBeLessThanOrEqual(CELL + 1e-9);
    }
  });

  it("squeezes the beam axis, never the length", () => {
    const m = manifest["blue/submarine"]!; // the wide lateen diamond
    const { kx, ky } = spriteUnitsPerPixel(3, m.w, m.h, m.hullCx, m.hullCy);
    expect(2 * Math.max(m.hullCx, 1 - m.hullCx) * m.w * kx)
      .toBeCloseTo(3 * CELL - SHIP_LEN_MARGIN, 5);
    // beam hits the cap on its farthest side
    expect(2 * Math.max(m.hullCy, 1 - m.hullCy) * m.h * ky)
      .toBeCloseTo(SHIP_BEAM, 5);
    expect(ky).toBeLessThan(kx);
  });
});
