import { coordKey, inBounds, orthogonalNeighbors } from "../engine/coords";
import { randInt, type Rng } from "../engine/rng";
import { shipLength, type ShipId } from "../engine/rules";
import type { Coord } from "../engine/types";
import {
  activeHits,
  axisRoom,
  fitsAt,
  remainingLengths,
  untried,
} from "./common";
import type { Knowledge } from "./knowledge";

/**
 * Medium AI: checkerboard hunt + per-ship target mode.
 *
 * - Hunt: fire only on cells where (row+col) % m === 0 for the smallest
 *   remaining ship length m, restricted to cells where a length-m
 *   segment could still fit; relax to any fitting cell, then any
 *   untried cell, if the parity pool runs dry.
 * - Target: with live hit data, chase the damaged ship that has the
 *   most active hits (ties: earliest first hit). Collinear hits extend
 *   the line at both ends; a single hit probes orthogonal neighbours on
 *   axes where a full-length segment can still fit.
 */
export function mediumShot(k: Knowledge, rng: Rng): Coord {
  const targets = activeHits(k);
  if (targets.size > 0) {
    // Most active hits first; Map insertion order is first-hit order and
    // the sort is stable, so ties keep the earliest first hit.
    const ordered = [...targets.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );
    for (const [id, cells] of ordered) {
      const c = targetShip(k, id, cells, rng);
      if (c) return c;
    }
    // Live hits but no legal continuation (inconsistent data): hunt.
  }
  return huntShot(k, rng);
}

function targetShip(
  k: Knowledge,
  id: ShipId,
  cells: Coord[],
  rng: Rng,
): Coord | null {
  const L = shipLength(id, k.rules);
  if (cells.length >= 2 && collinear(cells)) {
    const end = extendLine(k, id, cells, L, rng);
    if (end) return end;
  }
  return pickNeighbour(k, id, cells, L, rng);
}

function collinear(cells: Coord[]): boolean {
  const first = cells[0];
  if (!first) return false;
  return (
    cells.every((c) => c.row === first.row) ||
    cells.every((c) => c.col === first.col)
  );
}

/**
 * With >= 2 collinear hits on one ship, find the untried cell at each
 * end of the line (walking past this ship's own active hits), and prefer
 * an end where a length-L segment containing all the hits is still
 * possible. Returns null if neither end works.
 */
function extendLine(
  k: Knowledge,
  id: ShipId,
  cells: Coord[],
  L: number,
  rng: Rng,
): Coord | null {
  const first = cells[0];
  if (!first) return null;
  const horizontal = cells.every((c) => c.row === first.row);
  const axisVal = (c: Coord): number => (horizontal ? c.col : c.row);
  const fixed = horizontal ? first.row : first.col;
  const at = (v: number): Coord =>
    horizontal ? { row: fixed, col: v } : { row: v, col: fixed };

  const vals = cells.map(axisVal);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const own = new Set(cells.map(coordKey));
  const fired = new Set(k.shots.map((s) => coordKey(s.coord)));

  const ends: Coord[] = [];
  for (const dir of [-1, 1] as const) {
    let v = (dir === -1 ? lo : hi) + dir;
    while (inBounds(at(v), k.rules) && own.has(coordKey(at(v)))) v += dir;
    const c = at(v);
    if (inBounds(c, k.rules) && !fired.has(coordKey(c))) ends.push(c);
  }

  const runLen = axisRoom(k, first, horizontal ? "H" : "V", id);
  const qualifying = ends.filter((c) => {
    const v = axisVal(c);
    const extSpan = Math.max(hi, v) - Math.min(lo, v) + 1;
    return extSpan <= L && runLen >= L;
  });
  if (qualifying.length === 0) return null;
  return qualifying[randInt(rng, qualifying.length)] ?? null;
}

/**
 * Probe orthogonally around the ship's hits: an untried neighbour is a
 * candidate when a length-L segment containing the hit and the
 * neighbour still fits (usable run on that axis >= L). Prefer the axis
 * with more room, then pick randomly.
 */
function pickNeighbour(
  k: Knowledge,
  id: ShipId,
  cells: Coord[],
  L: number,
  rng: Rng,
): Coord | null {
  const fired = new Set(k.shots.map((s) => coordKey(s.coord)));
  const cands: { c: Coord; room: number }[] = [];
  for (const h of cells) {
    for (const n of orthogonalNeighbors(h, k.rules)) {
      if (fired.has(coordKey(n))) continue;
      const axis = n.row === h.row ? "H" : "V";
      const room = axisRoom(k, h, axis, id);
      if (room >= L) cands.push({ c: n, room });
    }
  }
  if (cands.length === 0) return null;
  const maxRoom = Math.max(...cands.map((x) => x.room));
  const best = cands.filter((x) => x.room === maxRoom);
  return best[randInt(rng, best.length)]?.c ?? null;
}

function huntShot(k: Knowledge, rng: Rng): Coord {
  const all = untried(k);
  if (all.length === 0) {
    // Unreachable in a live game.
    throw new Error("mediumShot: no untried cells remain");
  }
  const lens = remainingLengths(k);
  const m = lens.length === 0 ? 1 : Math.min(...lens);
  let pool = all.filter((c) => (c.row + c.col) % m === 0 && fitsAt(k, c, m));
  if (pool.length === 0) pool = all.filter((c) => fitsAt(k, c, m));
  if (pool.length === 0) pool = all;
  const pick = pool[randInt(rng, pool.length)];
  if (!pick) throw new Error("mediumShot: no untried cells remain");
  return pick;
}
