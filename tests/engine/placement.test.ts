import { describe, expect, it } from "vitest";

import { coordKey } from "../../src/engine/coords";
import {
  placeShip,
  randomPlacement,
  shipCells,
  validateFleet,
} from "../../src/engine/placement";
import { mulberry32, type Rng } from "../../src/engine/rng";
import { FLEET, type ShipId } from "../../src/engine/rules";
import type { Placement } from "../../src/engine/types";

// A legal fleet: five ships stacked in rows A–E, columns 1+.
const baseFleet = (): Placement[] => [
  { id: "carrier", row: 0, col: 0, orientation: "H" },
  { id: "battleship", row: 1, col: 0, orientation: "H" },
  { id: "cruiser", row: 2, col: 0, orientation: "H" },
  { id: "submarine", row: 3, col: 0, orientation: "H" },
  { id: "destroyer", row: 4, col: 0, orientation: "H" },
];

describe("shipCells", () => {
  it("computes horizontal cells", () => {
    expect(shipCells({ id: "cruiser", row: 1, col: 2, orientation: "H" })).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
    ]);
  });

  it("computes vertical cells", () => {
    expect(shipCells({ id: "destroyer", row: 1, col: 2, orientation: "V" })).toEqual([
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ]);
  });

  it("throws on an unknown ship id", () => {
    expect(() =>
      shipCells({ id: "schooner" as ShipId, row: 0, col: 0, orientation: "H" }),
    ).toThrow();
  });
});

describe("placeShip", () => {
  it("accepts a legal ship and returns a new fleet array", () => {
    const fleet = baseFleet().slice(0, 1);
    const r = placeShip(fleet, { id: "destroyer", row: 5, col: 5, orientation: "V" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(2);
    expect(r.value[1]).toEqual({ id: "destroyer", row: 5, col: 5, orientation: "V" });
    expect(fleet).toHaveLength(1); // input untouched
  });

  it.each([
    { name: "off the top edge", ship: { id: "destroyer", row: -1, col: 0, orientation: "H" } },
    { name: "off the left edge", ship: { id: "destroyer", row: 0, col: -1, orientation: "H" } },
    { name: "off the bottom edge (origin)", ship: { id: "destroyer", row: 10, col: 0, orientation: "H" } },
    { name: "off the right edge (origin)", ship: { id: "destroyer", row: 0, col: 10, orientation: "H" } },
    { name: "hanging off the right edge", ship: { id: "destroyer", row: 0, col: 9, orientation: "H" } },
    { name: "hanging off the bottom edge", ship: { id: "destroyer", row: 9, col: 0, orientation: "V" } },
    { name: "carrier hanging off the right edge", ship: { id: "carrier", row: 0, col: 6, orientation: "H" } },
    { name: "carrier hanging off the bottom edge", ship: { id: "carrier", row: 6, col: 0, orientation: "V" } },
  ] as { name: string; ship: Placement }[])(
    "rejects out_of_bounds: $name",
    ({ ship }) => {
      expect(placeShip([], ship)).toEqual({ ok: false, error: "out_of_bounds" });
    },
  );

  it("accepts ships that exactly reach the edges", () => {
    // Carrier at column 6 (0-based col 5): cells 5-9, legal. One more column is not.
    expect(placeShip([], { id: "carrier", row: 0, col: 5, orientation: "H" }).ok).toBe(true);
    expect(placeShip([], { id: "carrier", row: 5, col: 0, orientation: "V" }).ok).toBe(true);
  });

  it("rejects overlap", () => {
    const fleet = [{ id: "carrier", row: 0, col: 0, orientation: "H" } as Placement];
    const r = placeShip(fleet, { id: "battleship", row: 0, col: 3, orientation: "V" });
    expect(r).toEqual({ ok: false, error: "overlap" });
  });

  it("accepts ships that touch (adjacency is legal)", () => {
    const fleet = [{ id: "carrier", row: 0, col: 0, orientation: "H" } as Placement];
    // battleship on the very next row shares an edge with the carrier but no cell.
    const r = placeShip(fleet, { id: "battleship", row: 1, col: 0, orientation: "H" });
    expect(r.ok).toBe(true);
  });

  it("rejects a duplicate ship id", () => {
    const fleet = [{ id: "destroyer", row: 0, col: 0, orientation: "H" } as Placement];
    const r = placeShip(fleet, { id: "destroyer", row: 5, col: 5, orientation: "V" });
    expect(r).toEqual({ ok: false, error: "duplicate_ship" });
  });

  it("rejects an unknown ship id", () => {
    const r = placeShip([], { id: "schooner" as ShipId, row: 0, col: 0, orientation: "H" });
    expect(r).toEqual({ ok: false, error: "unknown_ship" });
  });
});

describe("validateFleet", () => {
  it("accepts a complete legal fleet", () => {
    const r = validateFleet(baseFleet());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(5);
  });

  it("rejects an incomplete fleet", () => {
    const r = validateFleet(baseFleet().slice(0, 4));
    expect(r).toEqual({ ok: false, error: "incomplete_fleet" });
  });

  it("propagates placement errors", () => {
    const overlapping: Placement[] = [
      { id: "carrier", row: 0, col: 0, orientation: "H" },
      { id: "battleship", row: 0, col: 0, orientation: "V" },
      { id: "cruiser", row: 3, col: 0, orientation: "H" },
      { id: "submarine", row: 4, col: 0, orientation: "H" },
      { id: "destroyer", row: 5, col: 0, orientation: "H" },
    ];
    expect(validateFleet(overlapping)).toEqual({ ok: false, error: "overlap" });
    const dup = baseFleet().map((p) =>
      p.id === "battleship" ? { ...p, id: "cruiser" as ShipId, row: 6 } : p,
    );
    expect(validateFleet(dup)).toEqual({ ok: false, error: "duplicate_ship" });
  });
});

describe("randomPlacement", () => {
  it("produces only valid fleets across 10,000 seeds", () => {
    const wantIds = [...FLEET.map((s) => s.id)].sort();
    for (let seed = 0; seed < 10_000; seed++) {
      const fleet = randomPlacement(mulberry32(seed));
      expect(validateFleet(fleet).ok).toBe(true);
      const cells = new Set(fleet.flatMap((p) => shipCells(p).map(coordKey)));
      expect(cells.size).toBe(17);
      expect(fleet.map((p) => p.id).sort()).toEqual(wantIds);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(randomPlacement(mulberry32(123))).toEqual(randomPlacement(mulberry32(123)));
  });

  it("always terminates, even on a degenerate rng", () => {
    const zero: Rng = () => 0;
    expect(() => randomPlacement(zero)).toThrow();
  });
});
