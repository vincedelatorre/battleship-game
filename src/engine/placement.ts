import { coordKey, inBounds } from "./coords";
import { randInt, type Rng } from "./rng";
import { RULES, shipLength, type Rules, type ShipId } from "./rules";
import type { Coord, Orientation, Placement, Result } from "./types";

export type PlacementError =
  | "unknown_ship"
  | "duplicate_ship"
  | "out_of_bounds"
  | "overlap";

const MAX_SHIP_TRIES = 1000;
const MAX_FLEET_TRIES = 1000;

export function shipCells(p: Placement, rules: Rules = RULES): Coord[] {
  const length = shipLength(p.id, rules);
  const cells: Coord[] = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      p.orientation === "H"
        ? { row: p.row, col: p.col + i }
        : { row: p.row + i, col: p.col },
    );
  }
  return cells;
}

export function placeShip(
  fleet: readonly Placement[],
  ship: Placement,
  rules: Rules = RULES,
): Result<Placement[], PlacementError> {
  if (!rules.fleet.some((s) => s.id === ship.id)) {
    return { ok: false, error: "unknown_ship" };
  }
  if (fleet.some((p) => p.id === ship.id)) {
    return { ok: false, error: "duplicate_ship" };
  }
  const cells = shipCells(ship, rules);
  if (!cells.every((c) => inBounds(c, rules))) {
    return { ok: false, error: "out_of_bounds" };
  }
  const occupied = new Set(
    fleet.flatMap((p) => shipCells(p, rules).map(coordKey)),
  );
  if (cells.some((c) => occupied.has(coordKey(c)))) {
    return { ok: false, error: "overlap" };
  }
  return { ok: true, value: [...fleet, ship] };
}

/** Exactly one of each ship in rules.fleet, all legal and non-overlapping. */
export function validateFleet(
  fleet: readonly Placement[],
  rules: Rules = RULES,
): Result<Placement[], PlacementError | "incomplete_fleet"> {
  let placed: Placement[] = [];
  for (const ship of fleet) {
    const r = placeShip(placed, ship, rules);
    if (!r.ok) {
      return r;
    }
    placed = r.value;
  }
  if (placed.length !== rules.fleet.length) {
    return { ok: false, error: "incomplete_fleet" };
  }
  return { ok: true, value: placed };
}

function tryPlaceRandom(
  rng: Rng,
  id: ShipId,
  length: number,
  fleet: readonly Placement[],
  rules: Rules,
): Placement | null {
  for (let i = 0; i < MAX_SHIP_TRIES; i++) {
    const orientation: Orientation = randInt(rng, 2) === 0 ? "H" : "V";
    // Restrict the origin so a ship of this length can fit.
    const row = randInt(rng, orientation === "V" ? rules.rows - length + 1 : rules.rows);
    const col = randInt(rng, orientation === "H" ? rules.cols - length + 1 : rules.cols);
    const ship: Placement = { id, row, col, orientation };
    if (placeShip(fleet, ship, rules).ok) {
      return ship;
    }
  }
  return null;
}

/** Always terminates: retries per ship, restarts the whole fleet on exhaustion. */
export function randomPlacement(rng: Rng, rules: Rules = RULES): Placement[] {
  for (let restart = 0; restart < MAX_FLEET_TRIES; restart++) {
    const fleet: Placement[] = [];
    let failed = false;
    for (const spec of rules.fleet) {
      const ship = tryPlaceRandom(rng, spec.id, spec.length, fleet, rules);
      if (ship === null) {
        failed = true;
        break;
      }
      fleet.push(ship);
    }
    if (!failed) {
      return fleet;
    }
  }
  throw new Error(
    `randomPlacement: no legal fleet after ${MAX_FLEET_TRIES} restarts`,
  );
}
