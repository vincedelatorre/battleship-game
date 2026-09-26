import { describe, expect, it } from "vitest";

import { activeHits, untried } from "../../src/ai/common";
import { initialKnowledge, observe, type Knowledge } from "../../src/ai/knowledge";
import { mediumShot } from "../../src/ai/medium";
import { mulberry32 } from "../../src/engine/rng";
import { RULES, type ShipId } from "../../src/engine/rules";
import type { Coord, GameEvent, ShotResult } from "../../src/engine/types";

/** Build a Knowledge by replaying one engine action's events per array entry. */
function know(me: 0 | 1, ...actions: GameEvent[][]): Knowledge {
  let k = initialKnowledge(RULES, me);
  for (const events of actions) {
    k = observe(k, events);
  }
  return k;
}

const shot = (
  row: number,
  col: number,
  result: ShotResult,
  shipId?: ShipId,
): GameEvent => ({
  type: "shot",
  by: 0,
  coord: { row, col },
  result,
  ...(shipId !== undefined ? { shipId } : {}),
  seq: 0,
});

const hit = (row: number, col: number, shipId: ShipId): GameEvent =>
  shot(row, col, "hit", shipId);
const miss = (row: number, col: number): GameEvent => shot(row, col, "miss");
const sunkShip = (row: number, col: number, shipId: ShipId): GameEvent[] => [
  shot(row, col, "sunk", shipId),
  { type: "sunk", by: 0, shipId, seq: 0 },
];

const move = (k: Knowledge, seed = 1): Coord => mediumShot(k, mulberry32(seed));

describe("mediumShot — target mode", () => {
  it("extends the line after two collinear hits", () => {
    const k = know(0, [hit(0, 3, "cruiser")], [hit(0, 4, "cruiser")]);
    // Both ends are legal: (0,2) or (0,5).
    const c = move(k);
    expect(c.row === 0 && (c.col === 2 || c.col === 5)).toBe(true);
  });

  it("reverses direction after a miss at one end", () => {
    const k = know(
      0,
      [miss(0, 2)],
      [hit(0, 3, "cruiser")],
      [hit(0, 4, "cruiser")],
    );
    expect(move(k)).toEqual({ row: 0, col: 5 });
  });

  it("reverses direction at the board edge", () => {
    const k = know(0, [hit(0, 0, "battleship")], [hit(0, 1, "battleship")]);
    expect(move(k)).toEqual({ row: 0, col: 2 });
  });

  it("never extends one ship's line through another ship's hit", () => {
    // Cruiser hit twice; a *destroyer* hit sits on its would-be extension.
    const k = know(
      0,
      [hit(0, 0, "cruiser")],
      [hit(0, 1, "cruiser")],
      [hit(0, 2, "destroyer")],
    );
    const c = move(k);
    // Line extension right is blocked by the destroyer hit; only the
    // vertical neighbours of the cruiser's hits are valid targets.
    expect(c.col === 0 || c.col === 1).toBe(true);
    expect(c.row).toBe(1);
  });

  it("keeps chasing a damaged ship before hunting, even after sinking another", () => {
    const k = know(
      0,
      [hit(9, 8, "destroyer")],
      sunkShip(9, 9, "destroyer"),
      [hit(5, 5, "submarine")],
    );
    expect(activeHits(k).has("destroyer")).toBe(false);
    const c = move(k);
    expect(
      (c.row === 5 && (c.col === 4 || c.col === 6)) ||
        (c.col === 5 && (c.row === 4 || c.row === 6)),
    ).toBe(true);
  });

  it("returns to hunt mode once the last damaged ship sinks", () => {
    const k = know(0, [hit(9, 8, "destroyer")], sunkShip(9, 9, "destroyer"));
    const c = move(k);
    // Destroyer is sunk; smallest remaining length is 3 -> parity mod 3.
    expect((c.row + c.col) % 3).toBe(0);
  });

  it("targets the ship with the most hits; ties break by earliest first hit", () => {
    const k = know(
      0,
      [hit(0, 0, "battleship")], // first hit overall
      [hit(5, 5, "submarine")],
    );
    // Both have 1 active hit -> battleship (earliest) is the target.
    const c = move(k);
    expect(
      (c.row === 0 && c.col === 1) || (c.row === 1 && c.col === 0),
    ).toBe(true);
  });

  it("avoids the axis where the ship cannot fit", () => {
    // Single battleship hit at (0,0); (0,1) is a miss, so no length-4
    // horizontal segment can contain it — it must shoot vertically.
    const k = know(0, [hit(0, 0, "battleship")], [miss(0, 1)]);
    expect(move(k)).toEqual({ row: 1, col: 0 });
  });

  it("falls back per-hit when a boxed-in line cannot extend", () => {
    // Cruiser hit at (0,4)-(0,5) with misses at both ends: (0,3) and (0,6).
    const k = know(
      0,
      [miss(0, 3)],
      [hit(0, 4, "cruiser")],
      [hit(0, 5, "cruiser")],
      [miss(0, 6)],
    );
    const c = move(k);
    expect(
      (c.row === 1 && (c.col === 4 || c.col === 5)),
    ).toBe(true);
  });
});

describe("mediumShot — stale hits (Ghost Ship)", () => {
  it("does not target stale hits and hunts the relocated ship again", () => {
    const k = know(
      0,
      [hit(0, 0, "cruiser")],
      [{ type: "relocated", by: 1, shipId: "cruiser", seq: 0 }],
    );
    expect(k.staleHits).toEqual(["0,0"]);
    expect(activeHits(k).size).toBe(0); // nothing to chase -> hunt mode
    const c = move(k);
    expect((c.row + c.col) % 2).toBe(0); // hunt parity with destroyer alive
    expect(c).not.toEqual({ row: 0, col: 1 }); // never chases the stale cell
    expect(c).not.toEqual({ row: 1, col: 0 });
  });
});

describe("mediumShot — hunt mode", () => {
  it("respects parity of the smallest remaining length", () => {
    // Full fleet: m = 2 -> checkerboard.
    const k = know(0);
    for (let seed = 0; seed < 20; seed++) {
      const c = mediumShot(k, mulberry32(seed));
      expect((c.row + c.col) % 2).toBe(0);
    }
  });

  it("uses m = 3 once the destroyer is sunk", () => {
    const k = know(0, [hit(9, 8, "destroyer")], sunkShip(9, 9, "destroyer"));
    for (let seed = 0; seed < 20; seed++) {
      const c = mediumShot(k, mulberry32(seed));
      expect((c.row + c.col) % 3).toBe(0);
    }
  });

  it("relaxes parity rather than picking a useless cell", () => {
    // Fire misses at every even-parity cell. The parity pool is empty, and
    // every odd-parity cell is surrounded by misses (no length-2 fit), so
    // the AI must fall all the way back to any untried cell.
    const misses: GameEvent[] = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if ((row + col) % 2 === 0) misses.push(miss(row, col));
      }
    }
    const k = know(0, misses);
    const c = move(k);
    expect((c.row + c.col) % 2).toBe(1);
    expect(untried(k)).toContainEqual(c);
  });
});
