import type { Coord } from "../../engine/types";
import type { Placement } from "../../engine/types";
import { shipCells } from "../../engine/placement";

/**
 * Board world layout — pure math, no three.js.
 *
 * Cell = 4 world units; each 10×10 grid is 40×40.
 * The grids sit side by side along x: player grid ("Your Fleet") centred
 * at x=-24, enemy ("Enemy Waters") at x=+24, both centred on z=0; the
 * 8-unit gap between them is open water.
 * Columns 1–10 run along x, rows A–J along z, row A on the -z edge of
 * each grid so both grids read the same from the default camera.
 * Portrait viewports yaw the camera 90° so the grids stack on screen.
 */
export const CELL = 4;
export const GRID_CELLS = 10;
export const GRID_SIZE = CELL * GRID_CELLS; // 40
export const HALF = GRID_SIZE / 2;

export type GridId = "player" | "enemy";

export function gridCenterX(grid: GridId): number {
  return grid === "player" ? -24 : 24;
}

/** World-space rect of a grid's water area. */
export function gridBounds(grid: GridId): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const cx = gridCenterX(grid);
  return { minX: cx - HALF, maxX: cx + HALF, minZ: -HALF, maxZ: HALF };
}

/** Centre of a cell in world space. */
export function cellToWorld(grid: GridId, c: Coord): { x: number; z: number } {
  const cx = gridCenterX(grid);
  return {
    x: cx - HALF + c.col * CELL + CELL / 2,
    z: -HALF + c.row * CELL + CELL / 2,
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
 * length axis. The perpendicular extent (sails/pennants, h px) is
 * squeezed non-uniformly to at most 1.5 cells — slimmer sprites keep
 * ky = kx.
 */
export function spriteUnitsPerPixel(
  spanCells: number,
  spriteW: number,
  spriteH: number,
  lenFraction = 1,
): { kx: number; ky: number } {
  // lenFraction excludes pennant wisps that trail past the stern/bowsprit
  const kx = (spanCells * CELL * 0.96) / (spriteW * lenFraction);
  const ky = Math.min(kx, (CELL * 1.5) / spriteH);
  return { kx, ky };
}
