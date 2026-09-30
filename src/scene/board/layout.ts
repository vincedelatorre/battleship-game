import type { Coord } from "../../engine/types";
import type { Placement } from "../../engine/types";
import { shipCells } from "../../engine/placement";

/**
 * Board world layout — pure math, no three.js.
 *
 * Cell = 4 world units; each 10×10 grid is 40×40.
 * Two layouts, both read like the paper chart (row A at the far edge,
 * rows → +z, col 1 → -x, cols → +x — the default un-yawed camera looks
 * down the +z axis so A is up-screen and 1 is left):
 *  - "side":    grids side by side along x — player x=-24, enemy x=+24.
 *  - "stacked": grids along z — enemy far at z=-24, player near at z=+24,
 *               for portrait/narrow canvases.
 * The 8-unit gap between the grids is open water in both modes.
 */
export const CELL = 4;
export const GRID_CELLS = 10;
export const GRID_SIZE = CELL * GRID_CELLS; // 40
export const HALF = GRID_SIZE / 2;

export type GridId = "player" | "enemy";
export type BoardLayout = "side" | "stacked";

let boardLayout: BoardLayout = "side";
export function setBoardLayout(m: BoardLayout): void {
  boardLayout = m;
}
export function getBoardLayout(): BoardLayout {
  return boardLayout;
}

export function gridCenterX(grid: GridId): number {
  return boardLayout === "stacked" ? 0 : grid === "player" ? -24 : 24;
}

export function gridCenterZ(grid: GridId): number {
  return boardLayout === "stacked" ? (grid === "enemy" ? -24 : 24) : 0;
}

/** World-space rect of a grid's water area. */
export function gridBounds(grid: GridId): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  return {
    minX: gridCenterX(grid) - HALF,
    maxX: gridCenterX(grid) + HALF,
    minZ: gridCenterZ(grid) - HALF,
    maxZ: gridCenterZ(grid) + HALF,
  };
}

/** Centre of a cell in world space. */
export function cellToWorld(grid: GridId, c: Coord): { x: number; z: number } {
  return {
    x: gridCenterX(grid) - HALF + c.col * CELL + CELL / 2,
    z: gridCenterZ(grid) - HALF + c.row * CELL + CELL / 2,
  };
}

/** Inverse of cellToWorld; null when the point is outside the grid. */
export function worldToCell(
  grid: GridId,
  x: number,
  z: number,
): Coord | null {
  const b = gridBounds(grid);
  if (x < b.minX || x >= b.maxX || z < b.minZ || z >= b.maxZ) return null;
  return {
    row: Math.floor((z - b.minZ) / CELL),
    col: Math.floor((x - b.minX) / CELL),
  };
}

/** Centre + yaw (rad) + span for rendering a placed ship. Bow toward +x for "H". */
export function placementTransform(
  grid: GridId,
  p: Placement,
): { x: number; z: number; yaw: number; spanCells: number } {
  const cells = shipCells(p);
  let sx = 0;
  let sz = 0;
  for (const c of cells) {
    const w = cellToWorld(grid, c);
    sx += w.x;
    sz += w.z;
  }
  return {
    x: sx / cells.length,
    z: sz / cells.length,
    yaw: p.orientation === "H" ? 0 : -Math.PI / 2, // bow +x → bow +z
    spanCells: cells.length,
  };
}

/**
 * Per-axis world units per sprite pixel. The full sprite length —
 * bowsprit tip to stern, w px — spans spanCells × CELL × 0.96 along the
 * The sprite is centred on its HULL (hullCx/hullCy — the dense hull
 * band, not the bbox, since pennants pile up on one side). The scale
 * then guarantees the farthest visible pixel on each side stays inside
 * the margins: length half-extent ≤ (cells×4 − margin)/2, beam
 * half-extent ≤ SHIP_BEAM/2. Only the beam axis is squeezed.
 */
export const SHIP_LEN_MARGIN = 0.5; // world units off the cell span
export const SHIP_BEAM = CELL * 0.82; // ~0.9u clear water each side
/** ship deck height above the water plane, world units */
export const SHIP_FLOAT_H = 1.15;
/** animation clamps, exported so the footprint test can assert extremes */
export const SHIP_SWAY_MAX = 0.016; // rad of yaw drift
export const SHIP_PITCH_MAX = 0.07;
export const SHIP_ROLL_MAX = 0.1;

/** The 11 line positions per axis for a grid — same constants the
 * static grid-overlay shader uses (CELL spacing, GRID_SIZE extent). */
export function gridLineWorldPositions(grid: GridId): { x: number[]; z: number[] } {
  const b = gridBounds(grid);
  const x: number[] = [];
  const z: number[] = [];
  for (let i = 0; i <= GRID_CELLS; i++) {
    x.push(b.minX + i * CELL);
    z.push(b.minZ + i * CELL);
  }
  return { x, z };
}

export function spriteUnitsPerPixel(
  spanCells: number,
  spriteW: number,
  spriteH: number,
  hullCx = 0.5,
  hullCy = 0.5,
): { kx: number; ky: number } {
  const halfLenPx = Math.max(hullCx, 1 - hullCx) * spriteW;
  const halfBeamPx = Math.max(hullCy, 1 - hullCy) * spriteH;
  const kx = (spanCells * CELL - SHIP_LEN_MARGIN) / (2 * halfLenPx);
  const ky = Math.min(kx, SHIP_BEAM / (2 * halfBeamPx));
  return { kx, ky };
}
