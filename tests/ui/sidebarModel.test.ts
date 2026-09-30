import { describe, expect, it } from "vitest";
import { createGame, fire } from "../../src/engine/game";
import type {
  GameEvent,
  GameState,
  Placement,
  ShipState,
} from "../../src/engine/types";
import { RULES } from "../../src/engine/rules";
import { logLine, sidebarModel } from "../../src/ui/battle/sidebarModel";

// Every ship horizontal on its own row: carrier A, battleship C, cruiser E,
// submarine G, destroyer I — all starting at column 1.
const ROWS: readonly Placement[] = [
  { id: "carrier", row: 0, col: 0, orientation: "H" },
  { id: "battleship", row: 2, col: 0, orientation: "H" },
  { id: "cruiser", row: 4, col: 0, orientation: "H" },
  { id: "submarine", row: 6, col: 0, orientation: "H" },
  { id: "destroyer", row: 8, col: 0, orientation: "H" },
];

// Carrier and battleship vertical down columns 1 and 3; rest horizontal.
const MIXED: readonly Placement[] = [
  { id: "carrier", row: 0, col: 0, orientation: "V" },
  { id: "battleship", row: 0, col: 2, orientation: "V" },
  { id: "cruiser", row: 5, col: 5, orientation: "H" },
  { id: "submarine", row: 7, col: 5, orientation: "H" },
  { id: "destroyer", row: 9, col: 5, orientation: "H" },
];

function game(
  myFleet: readonly Placement[],
  aiFleet: readonly Placement[],
): GameState {
  const r = createGame({ rules: RULES, fleets: [myFleet, aiFleet] });
  if (!r.ok) throw new Error(`createGame rejected: ${r.error}`);
  return r.value;
}

/** Engine fire for `by`; turn is forced so we can script either side. */
function shot(
  state: GameState,
  by: 0 | 1,
  coord: { row: number; col: number },
): GameState {
  const r = fire({ ...state, turn: by }, by, coord);
  if (!r.ok) throw new Error(`fire ${coord.row},${coord.col} rejected: ${r.error}`);
  return r.value.state;
}

describe("sidebarModel — own fleet", () => {
  it("maps enemy hits to cell indices along a horizontal ship", () => {
    // enemy hits our carrier (row A, cols 1..5) at A1 and A3
    let s = game(ROWS, ROWS);
    s = shot(s, 1, { row: 0, col: 0 });
    s = shot(s, 1, { row: 0, col: 2 });
    const m = sidebarModel(s, 0);
    const carrier = m.own.find((o) => o.id === "carrier")!;
    expect(carrier.hitCells).toEqual([0, 2]);
    expect(carrier.sunk).toBe(false);
  });

  it("maps enemy hits to cell indices along a vertical ship", () => {
    // battleship V at col 3 (col=2), cells rows 0..3 — hit cells 1 and 3
    let s = game(MIXED, ROWS);
    s = shot(s, 1, { row: 1, col: 2 });
    s = shot(s, 1, { row: 3, col: 2 });
    const m = sidebarModel(s, 0);
    const bs = m.own.find((o) => o.id === "battleship")!;
    expect(bs.hitCells).toEqual([1, 3]);
    expect(m.ownHits).toEqual([
      { row: 1, col: 2 },
      { row: 3, col: 2 },
    ]);
  });

  it("reports own sunk ships and enemy misses in our waters", () => {
    let s = game(ROWS, ROWS);
    s = shot(s, 1, { row: 8, col: 0 }); // hit destroyer
    s = shot(s, 1, { row: 8, col: 1 }); // sink destroyer
    s = shot(s, 1, { row: 4, col: 9 }); // miss (open water)
    const m = sidebarModel(s, 0);
    expect(m.own.find((o) => o.id === "destroyer")!.sunk).toBe(true);
    expect(m.stats.ownAfloat).toBe(4);
    expect(m.ownMisses).toEqual([{ row: 4, col: 9 }]);
  });
});

describe("sidebarModel — enemy fleet (from our shots only)", () => {
  it("counts hits per ship and marks sunk", () => {
    let s = game(ROWS, ROWS);
    s = shot(s, 0, { row: 0, col: 1 }); // hit carrier
    s = shot(s, 0, { row: 8, col: 0 }); // hit destroyer
    s = shot(s, 0, { row: 8, col: 1 }); // sink destroyer
    const m = sidebarModel(s, 0);
    expect(m.enemy.find((e) => e.id === "carrier")!.hits).toBe(1);
    const dd = m.enemy.find((e) => e.id === "destroyer")!;
    expect(dd.hits).toBe(2);
    expect(dd.sunk).toBe(true);
    expect(m.enemy.find((e) => e.id === "cruiser")!.hits).toBe(0);
    expect(m.stats.enemyAfloat).toBe(4);
  });

  it("NEVER reads the enemy fleet: same shots → same model, no coords leak", () => {
    const a = shot(game(ROWS, ROWS), 0, { row: 0, col: 0 }); // hit
    const b = shot(game(ROWS, MIXED), 0, { row: 0, col: 0 }); // same result
    expect(sidebarModel(a, 0).enemy).toEqual(sidebarModel(b, 0).enemy);
    const json = JSON.stringify(sidebarModel(a, 0).enemy);
    expect(json).not.toMatch(/row|col|orientation/);
  });

  it("stats: shots, hits, accuracy, afloat counts", () => {
    let s = game(ROWS, ROWS);
    s = shot(s, 0, { row: 0, col: 0 }); // hit carrier
    s = shot(s, 0, { row: 0, col: 1 }); // hit carrier
    s = shot(s, 0, { row: 1, col: 1 }); // miss
    s = shot(s, 0, { row: 8, col: 0 }); // hit destroyer
    const m = sidebarModel(s, 0);
    expect(m.stats.shots).toBe(4);
    expect(m.stats.hits).toBe(3);
    expect(m.stats.accuracy).toBeCloseTo(0.75);
    expect(m.stats.ownAfloat).toBe(5);
    expect(m.stats.enemyAfloat).toBe(5);
  });
});

describe("logLine", () => {
  const shotEv = (
    by: 0 | 1,
    coord: { row: number; col: number },
    result: "miss" | "hit" | "sunk",
    shipId?: ShipState["id"],
  ): GameEvent => ({
    type: "shot",
    by,
    coord,
    result,
    ...(shipId ? { shipId } : {}),
    seq: 1,
  });

  it("formats our shots", () => {
    expect(logLine(0, shotEv(0, { row: 1, col: 6 }, "miss"))).toBe(
      "You fire B7 — miss.",
    );
    expect(logLine(0, shotEv(0, { row: 2, col: 2 }, "hit", "cruiser"))).toBe(
      "You fire C3 — hit, Frigate!",
    );
    expect(logLine(0, shotEv(0, { row: 2, col: 4 }, "sunk", "cruiser"))).toBe(
      "You sank their Frigate!",
    );
  });

  it("formats enemy shots", () => {
    expect(logLine(1, shotEv(1, { row: 5, col: 4 }, "miss"))).toBe(
      "Enemy fires F5 — miss.",
    );
    expect(logLine(1, shotEv(1, { row: 0, col: 0 }, "hit", "battleship"))).toBe(
      "Enemy fires A1 — hit, our Galleon!",
    );
    expect(logLine(1, shotEv(1, { row: 8, col: 1 }, "sunk", "destroyer"))).toBe(
      "They sank our Sloop!",
    );
  });

  it("ignores sunk markers and narrates game over", () => {
    expect(logLine(0, { type: "sunk", by: 0, shipId: "carrier", seq: 2 })).toBeNull();
    expect(logLine(0, { type: "gameOver", winner: 0, seq: 3 })).toBe(
      "Victory — the Strait is ours!",
    );
    expect(logLine(1, { type: "gameOver", winner: 1, seq: 3 })).toBe(
      "Defeat — our fleet rests on the bottom.",
    );
  });
});
