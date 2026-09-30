import {
  placeShip,
  randomPlacement,
  RULES,
  sameCoord,
  shipCells,
  shipLength,
  type Coord,
  type Orientation,
  type Placement,
  type PlacementError,
  type Rng,
  type Rules,
  type ShipId,
} from "../../engine/index";

/**
 * Placement phase state, DOM- and three-free. Every legality question
 * goes to the engine (placeShip); this module only decides where the
 * pointer puts a ship.
 */
export interface PlacementPreview {
  readonly placement: Placement;
  readonly cells: readonly Coord[];
  readonly valid: boolean;
  readonly error?: PlacementError;
}

export type PlacementClick = "placed" | "picked" | "invalid" | "none";

export interface PlacementController {
  placed(): readonly Placement[];
  selected(): ShipId | null;
  orientation(): Orientation;
  preview(): PlacementPreview | null;
  complete(): boolean;
  /** The placed ship covering `cell`, if any. */
  shipAt(cell: Coord): Placement | undefined;
  select(id: ShipId | null): void;
  rotate(): void;
  hover(cell: Coord | null): void;
  click(cell: Coord): PlacementClick;
  randomize(): void;
  clear(): void;
}

/**
 * The berth for ship `id` centred on `cell`, snapped to whole squares
 * and clamped so every square stays on the board — a ship can never hang
 * off the edge or sit between squares. Horizontal or vertical only.
 */
export function anchoredPlacement(
  id: ShipId,
  cell: Coord,
  orientation: Orientation,
  rules: Rules = RULES,
): Placement {
  const len = shipLength(id, rules);
  const back = Math.floor((len - 1) / 2);
  const clamp = (v: number, max: number) => Math.min(Math.max(Math.round(v), 0), max);
  return orientation === "H"
    ? { id, orientation, row: clamp(cell.row, rules.rows - 1), col: clamp(cell.col - back, rules.cols - len) }
    : { id, orientation, col: clamp(cell.col, rules.cols - 1), row: clamp(cell.row - back, rules.rows - len) };
}

export function createPlacement(rng: Rng, rules: Rules = RULES): PlacementController {
  let placed: Placement[] = [];
  let selected: ShipId | null = rules.fleet[0]?.id ?? null;
  let orientation: Orientation = "H";
  let hoverCell: Coord | null = null;

  const nextUnplaced = (): ShipId | null =>
    rules.fleet.find((s) => !placed.some((p) => p.id === s.id))?.id ?? null;

  function shipAt(cell: Coord): Placement | undefined {
    return placed.find((p) => shipCells(p, rules).some((c) => sameCoord(c, cell)));
  }

  function preview(): PlacementPreview | null {
    if (!selected || !hoverCell) return null;
    const placement = anchoredPlacement(selected, hoverCell, orientation, rules);
    const r = placeShip(placed, placement, rules);
    return {
      placement,
      cells: shipCells(placement, rules),
      valid: r.ok,
      ...(r.ok ? {} : { error: r.error }),
    };
  }

  return {
    placed: () => placed,
    selected: () => selected,
    orientation: () => orientation,
    preview,
    complete: () => placed.length === rules.fleet.length,
    shipAt,
    select(id) {
      if (id !== null && placed.some((p) => p.id === id)) {
        // choosing a ship that's already at sea lifts it back up
        const p = placed.find((q) => q.id === id)!;
        placed = placed.filter((q) => q.id !== id);
        orientation = p.orientation;
      }
      selected = id;
    },
    rotate() {
      orientation = orientation === "H" ? "V" : "H";
    },
    hover(cell) {
      hoverCell = cell;
    },
    click(cell) {
      hoverCell = cell;
      const pv = preview();
      if (pv?.valid) {
        placed = [...placed, pv.placement];
        selected = nextUnplaced();
        return "placed";
      }
      const hit = shipAt(cell);
      if (hit) {
        placed = placed.filter((p) => p.id !== hit.id);
        selected = hit.id;
        orientation = hit.orientation;
        return "picked";
      }
      return pv ? "invalid" : "none";
    },
    randomize() {
      placed = randomPlacement(rng, rules);
      selected = null;
    },
    clear() {
      placed = [];
      selected = rules.fleet[0]?.id ?? null;
    },
  };
}
