import { coordKey, inBounds } from "../engine/coords";
import type { ShipId } from "../engine/rules";
import type { Coord } from "../engine/types";
import type { Knowledge } from "./knowledge";

/**
 * Precomputed shot tables for one Knowledge snapshot, cached per
 * Knowledge object (Knowledge is immutable, so the cache stays valid).
 */
interface ShotMap {
  /** coordKeys of every cell I've fired at. */
  readonly fired: ReadonlySet<string>;
  /** coordKey -> shipId for my hits on enemy ships that are still live
   *  targets (not stale, not sunk). */
  readonly activeHitShip: ReadonlyMap<string, ShipId>;
}

const ctxCache = new WeakMap<Knowledge, ShotMap>();

function shotMap(k: Knowledge): ShotMap {
  const cached = ctxCache.get(k);
  if (cached) return cached;
  const sunk = new Set(k.sunk);
  const stale = new Set(k.staleHits);
  const fired = new Set<string>();
  const activeHitShip = new Map<string, ShipId>();
  for (const s of k.shots) {
    const key = coordKey(s.coord);
    fired.add(key);
    if (
      s.result === "hit" &&
      s.shipId !== undefined &&
      !sunk.has(s.shipId) &&
      !stale.has(key)
    ) {
      activeHitShip.set(key, s.shipId);
    }
  }
  const m: ShotMap = { fired, activeHitShip };
  ctxCache.set(k, m);
  return m;
}

/** Cells I have not fired at yet. */
export function untried(k: Knowledge): Coord[] {
  const { fired } = shotMap(k);
  const out: Coord[] = [];
  for (let row = 0; row < k.rules.rows; row++) {
    for (let col = 0; col < k.rules.cols; col++) {
      if (!fired.has(coordKey({ row, col }))) out.push({ row, col });
    }
  }
  return out;
}

/** Lengths of enemy ships I have not sunk yet. */
export function remainingLengths(k: Knowledge): number[] {
  const sunk = new Set(k.sunk);
  const { fleet } = k.rules;
  return fleet.filter((s) => !sunk.has(s.id)).map((s) => s.length);
}

/**
 * My live targets: non-stale 'hit' shots grouped by ship id, excluding
 * ships already sunk. Map order is first-hit order (ties: earliest).
 */
export function activeHits(k: Knowledge): Map<ShipId, Coord[]> {
  const { activeHitShip } = shotMap(k);
  const map = new Map<ShipId, Coord[]>();
  for (const s of k.shots) {
    if (s.shipId === undefined || !activeHitShip.has(coordKey(s.coord))) {
      continue;
    }
    const cells = map.get(s.shipId);
    if (cells) {
      cells.push(s.coord);
    } else {
      map.set(s.shipId, [s.coord]);
    }
  }
  return map;
}

/**
 * Is `cell` usable for a segment? A cell is usable when it is untried,
 * or an active hit — on `shipId` when one is given (target mode: other
 * ships' hits can't be part of this ship's body), otherwise on any ship
 * (hunt mode, where active hits are normally absent anyway).
 */
function usableCell(k: Knowledge, m: ShotMap, c: Coord, shipId?: ShipId): boolean {
  if (!inBounds(c, k.rules)) return false;
  const key = coordKey(c);
  if (!m.fired.has(key)) return true;
  const ship = m.activeHitShip.get(key);
  return shipId === undefined ? ship !== undefined : ship === shipId;
}

/**
 * Length of the longest contiguous run of usable cells through `cell`
 * along `axis` ("H" = same row, "V" = same column). 0 if `cell` itself
 * is unusable.
 */
export function axisRoom(
  k: Knowledge,
  cell: Coord,
  axis: "H" | "V",
  shipId?: ShipId,
): number {
  const m = shotMap(k);
  if (!usableCell(k, m, cell, shipId)) return 0;
  const [dr, dc] = axis === "H" ? [0, 1] : [1, 0];
  let n = 1;
  for (
    let i = 1;
    usableCell(k, m, { row: cell.row + dr * i, col: cell.col + dc * i }, shipId);
    i++
  ) {
    n++;
  }
  for (
    let i = 1;
    usableCell(k, m, { row: cell.row - dr * i, col: cell.col - dc * i }, shipId);
    i++
  ) {
    n++;
  }
  return n;
}

/**
 * True iff some H or V segment of `length` covers `cell` using only
 * usable cells (untried or active hits on the same ship). Equivalent to
 * an axisRoom >= length on either axis, since any segment covering the
 * cell must lie inside the maximal usable run through it.
 */
export function fitsAt(
  k: Knowledge,
  cell: Coord,
  length: number,
  shipId?: ShipId,
): boolean {
  return (
    axisRoom(k, cell, "H", shipId) >= length ||
    axisRoom(k, cell, "V", shipId) >= length
  );
}
