import { describe, expect, it } from "vitest";

import { coordKey, orthogonalNeighbors, parseLabel, coordLabel, sameCoord, inBounds } from "../../src/engine/coords";
import {
  createGame,
  fire,
  isSunk,
  remainingShips,
  rematch,
  shipAt,
} from "../../src/engine/game";
import { placeShip, shipCells, validateFleet, randomPlacement } from "../../src/engine/placement";
import { mulberry32, randInt } from "../../src/engine/rng";
import { RULES, shipLength } from "../../src/engine/rules";
import type {
  Coord,
  GameEvent,
  GameState,
  Placement,
  PlayerIndex,
} from "../../src/engine/types";

// Player 0's fleet: five ships stacked in rows A–E.
const fleetA = (): Placement[] => [
  { id: "carrier", row: 0, col: 0, orientation: "H" },
  { id: "battleship", row: 1, col: 0, orientation: "H" },
  { id: "cruiser", row: 2, col: 0, orientation: "H" },
  { id: "submarine", row: 3, col: 0, orientation: "H" },
  { id: "destroyer", row: 4, col: 0, orientation: "H" },
];

// Player 1's fleet: a different, still-legal layout.
const fleetB = (): Placement[] => [
  { id: "carrier", row: 0, col: 0, orientation: "V" },
  { id: "battleship", row: 0, col: 2, orientation: "V" },
  { id: "cruiser", row: 0, col: 4, orientation: "V" },
  { id: "submarine", row: 5, col: 5, orientation: "H" },
  { id: "destroyer", row: 9, col: 8, orientation: "H" },
];

function newGame(firstPlayer: PlayerIndex = 0): GameState {
  const r = createGame({ fleets: [fleetA(), fleetB()], firstPlayer });
  if (!r.ok) throw new Error(`createGame failed: ${r.error}`);
  return r.value;
}

function mustFire(state: GameState, player: PlayerIndex, coord: Coord) {
  const r = fire(state, player, coord);
  if (!r.ok) throw new Error(`fire failed: ${r.error}`);
  return r.value;
}

function allCells(fleet: readonly Placement[]): Coord[] {
  return fleet.flatMap((p) => shipCells(p));
}

function openCells(fleet: readonly Placement[], count: number): Coord[] {
  const occupied = new Set(allCells(fleet).map(coordKey));
  const out: Coord[] = [];
  for (let row = 0; row < RULES.rows && out.length < count; row++) {
    for (let col = 0; col < RULES.cols && out.length < count; col++) {
      const c = { row, col };
      if (!occupied.has(coordKey(c))) out.push(c);
    }
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe("createGame", () => {
  it("builds a fresh initial state", () => {
    const g = newGame();
    expect(g.rules).toBe(RULES);
    expect(g.status).toBe("playing");
    expect(g.turn).toBe(0);
    expect(g.winner).toBeNull();
    expect(g.seq).toBe(0);
    expect(g.firstPlayer).toBe(0);
    for (const p of g.players) {
      expect(p.fleet).toHaveLength(5);
      expect(p.fleet.every((s) => s.hits === 0)).toBe(true);
      expect(p.shots).toHaveLength(0);
    }
  });

  it("honours an explicit firstPlayer", () => {
    const g = newGame(1);
    expect(g.turn).toBe(1);
    expect(g.firstPlayer).toBe(1);
  });

  it("rejects an incomplete fleet", () => {
    const r = createGame({
      fleets: [[{ id: "carrier", row: 0, col: 0, orientation: "H" }], fleetB()],
    });
    expect(r).toEqual({ ok: false, error: "incomplete_fleet" });
  });

  it("rejects an overlapping fleet", () => {
    const overlapping: Placement[] = [
      { id: "carrier", row: 0, col: 0, orientation: "H" },
      { id: "battleship", row: 0, col: 0, orientation: "V" },
      { id: "cruiser", row: 3, col: 0, orientation: "H" },
      { id: "submarine", row: 4, col: 0, orientation: "H" },
      { id: "destroyer", row: 5, col: 0, orientation: "H" },
    ];
    expect(createGame({ fleets: [fleetA(), overlapping] })).toEqual({
      ok: false,
      error: "overlap",
    });
  });
});

describe("fire", () => {
  it("reports a miss on open water and flips the turn", () => {
    const g = newGame();
    const { state, events } = mustFire(g, 0, { row: 6, col: 6 });
    expect(events).toEqual([
      { type: "shot", by: 0, coord: { row: 6, col: 6 }, result: "miss", seq: 1 },
    ]);
    expect(state.turn).toBe(1);
    expect(state.seq).toBe(1);
    expect(state.status).toBe("playing");
    expect(state.players[0].shots).toEqual([
      { coord: { row: 6, col: 6 }, result: "miss" },
    ]);
    expect(state.players[1].fleet.every((s) => s.hits === 0)).toBe(true);
  });

  it("reports a hit and names the ship", () => {
    const { state, events } = mustFire(newGame(), 0, { row: 0, col: 0 });
    expect(events).toEqual([
      { type: "shot", by: 0, coord: { row: 0, col: 0 }, result: "hit", shipId: "carrier", seq: 1 },
    ]);
    const carrier = state.players[1].fleet.find((s) => s.id === "carrier");
    expect(carrier?.hits).toBe(1);
    expect(state.turn).toBe(1);
  });

  it("turn alternates after a hit, not just a miss", () => {
    let s = newGame();
    s = mustFire(s, 0, { row: 0, col: 0 }).state; // hit
    expect(s.turn).toBe(1);
    s = mustFire(s, 1, { row: 6, col: 6 }).state; // miss
    expect(s.turn).toBe(0);
  });

  it("sinks a ship on its last cell: sunk result, then a sunk event", () => {
    let s = newGame();
    s = mustFire(s, 0, { row: 9, col: 8 }).state; // destroyer cell 1
    s = mustFire(s, 1, { row: 6, col: 6 }).state; // miss, back to player 0
    const r = mustFire(s, 0, { row: 9, col: 9 }); // destroyer cell 2
    expect(r.events.map((e) => e.type)).toEqual(["shot", "sunk"]);
    expect(r.events[0]).toMatchObject({ result: "sunk", shipId: "destroyer", seq: 3 });
    expect(r.events[1]).toMatchObject({ type: "sunk", by: 0, shipId: "destroyer", seq: 3 });
    const destroyer = shipAt(r.state.players[1].fleet, { row: 9, col: 9 }, r.state.rules);
    expect(destroyer).toBeDefined();
    expect(destroyer && isSunk(destroyer, r.state.rules)).toBe(true);
    expect(remainingShips(r.state, 1)).toEqual([
      "carrier",
      "battleship",
      "cruiser",
      "submarine",
    ]);
    expect(r.state.turn).toBe(1); // non-winning sunk shot still flips the turn
  });

  it("does not damage an adjacent ship (touching ships are independent)", () => {
    const touching: Placement[] = [
      { id: "cruiser", row: 0, col: 0, orientation: "H" }, // shares an edge with…
      { id: "submarine", row: 1, col: 0, orientation: "H" }, // …the submarine
      { id: "destroyer", row: 9, col: 0, orientation: "H" },
      { id: "battleship", row: 9, col: 3, orientation: "H" },
      { id: "carrier", row: 5, col: 8, orientation: "V" },
    ];
    const g = createGame({ fleets: [fleetA(), touching] });
    if (!g.ok) throw new Error("setup failed");
    const r = mustFire(g.value, 0, { row: 0, col: 1 }); // cruiser cell
    expect(r.events[0]).toMatchObject({ result: "hit", shipId: "cruiser" });
    const sub = r.state.players[1].fleet.find((s) => s.id === "submarine");
    const cruiser = r.state.players[1].fleet.find((s) => s.id === "cruiser");
    expect(cruiser?.hits).toBe(1);
    expect(sub?.hits).toBe(0);
  });

  it.each([
    { row: -1, col: 0 },
    { row: 10, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 10 },
  ])("rejects out-of-bounds shot %j without changing state", (coord) => {
    const g = newGame();
    const before = JSON.stringify(g);
    expect(fire(g, 0, coord)).toEqual({ ok: false, error: "out_of_bounds" });
    expect(JSON.stringify(g)).toBe(before);
  });

  it("rejects a repeat shot without changing state", () => {
    let s = newGame();
    s = mustFire(s, 0, { row: 6, col: 6 }).state;
    s = mustFire(s, 1, { row: 6, col: 6 }).state;
    const before = JSON.stringify(s);
    expect(fire(s, 0, { row: 6, col: 6 })).toEqual({ ok: false, error: "already_fired" });
    expect(JSON.stringify(s)).toBe(before);
  });

  it("rejects a shot out of turn without changing state", () => {
    const g = newGame();
    const before = JSON.stringify(g);
    expect(fire(g, 1, { row: 0, col: 0 })).toEqual({ ok: false, error: "not_your_turn" });
    expect(JSON.stringify(g)).toBe(before);
  });

  it("checks errors in order: not_your_turn beats out_of_bounds", () => {
    const g = newGame();
    expect(fire(g, 1, { row: -1, col: -1 })).toEqual({
      ok: false,
      error: "not_your_turn",
    });
  });

  it("increments seq only on accepted shots, and events carry the new seq", () => {
    const s = newGame();
    expect(fire(s, 1, { row: 0, col: 0 }).ok).toBe(false); // rejected: seq stays 0
    expect(s.seq).toBe(0);
    const r1 = mustFire(s, 0, { row: 6, col: 6 });
    expect(r1.state.seq).toBe(1);
    expect(r1.events[0]?.seq).toBe(1);
    const r2 = mustFire(r1.state, 1, { row: 0, col: 0 });
    expect(r2.state.seq).toBe(2);
    expect(r2.events[0]?.seq).toBe(2);
  });
});

describe("winning", () => {
  it.each([0, 1] as const)("player %i wins by sinking the whole enemy fleet", (winner) => {
    const loser = (winner === 0 ? 1 : 0) as PlayerIndex;
    const fleets: [Placement[], Placement[]] = [fleetA(), fleetB()];
    const targets = allCells(fleets[loser]);
    // Loser fires misses at open water on the winner's board. Player 0 moves
    // first, so when player 0 wins the loser gets one fewer shot.
    const missCoords = openCells(fleets[winner], winner === 0 ? 16 : 17);
    let s = newGame();
    let lastEvents: GameEvent[] = [];
    let ti = 0;
    let mi = 0;
    while (s.status === "playing") {
      const coord = s.turn === winner ? targets[ti++] : missCoords[mi++];
      if (!coord) throw new Error("test script ran out of cells");
      const r = mustFire(s, s.turn, coord);
      s = r.state;
      lastEvents = r.events;
    }
    expect(s.status).toBe("over");
    expect(s.winner).toBe(winner);
    expect(s.turn).toBe(winner); // turn does not flip after the winning shot
    expect(s.seq).toBe(winner === 0 ? 33 : 34);
    expect(lastEvents.map((e) => e.type)).toEqual(["shot", "sunk", "gameOver"]);
    expect(lastEvents[2]).toMatchObject({ type: "gameOver", winner, seq: s.seq });
    expect(remainingShips(s, loser)).toEqual([]);
    expect(remainingShips(s, winner)).toHaveLength(5);
    // The game refuses any further shots — even from the player who would be next.
    expect(fire(s, loser, { row: 6, col: 6 })).toEqual({ ok: false, error: "game_over" });
    expect(fire(s, winner, { row: -1, col: -1 })).toEqual({ ok: false, error: "game_over" });
  });
});

describe("rematch", () => {
  it("alternates firstPlayer every rematch (0 → 1 → 0)", () => {
    let g = newGame(0);
    g = mustFire(g, 0, { row: 0, col: 0 }).state; // dirty the state
    const r1 = rematch(g, [fleetB(), fleetA()]);
    if (!r1.ok) throw new Error("rematch failed");
    expect(r1.value.firstPlayer).toBe(1);
    expect(r1.value.turn).toBe(1);
    expect(r1.value.seq).toBe(0);
    expect(r1.value.status).toBe("playing");
    expect(r1.value.winner).toBeNull();
    expect(r1.value.rules).toBe(g.rules);
    for (const p of r1.value.players) {
      expect(p.shots).toHaveLength(0);
      expect(p.fleet.every((s) => s.hits === 0)).toBe(true);
    }
    const r2 = rematch(r1.value, [fleetA(), fleetB()]);
    if (!r2.ok) throw new Error("second rematch failed");
    expect(r2.value.firstPlayer).toBe(0);
    expect(r2.value.turn).toBe(0);
  });

  it("propagates fleet errors", () => {
    const bad: Placement[] = [{ id: "carrier", row: 9, col: 9, orientation: "H" }];
    expect(rematch(newGame(), [bad, fleetB()])).toEqual({
      ok: false,
      error: "out_of_bounds",
    });
  });
});

describe("queries", () => {
  it("shipAt finds the ship on a cell and returns undefined on water", () => {
    const fleet = newGame().players[1].fleet;
    expect(shipAt(fleet, { row: 2, col: 0 }, RULES)?.id).toBe("carrier");
    expect(shipAt(fleet, { row: 6, col: 6 }, RULES)).toBeUndefined();
  });

  it("isSunk reflects accumulated hits", () => {
    let s = newGame();
    s = mustFire(s, 0, { row: 9, col: 8 }).state;
    const destroyer = s.players[1].fleet.find((x) => x.id === "destroyer");
    expect(destroyer && isSunk(destroyer, s.rules)).toBe(false);
  });

  it("remainingShips starts with the full fleet", () => {
    expect(remainingShips(newGame(), 0)).toEqual([
      "carrier",
      "battleship",
      "cruiser",
      "submarine",
      "destroyer",
    ]);
  });
});

describe("immutability", () => {
  it("no engine function mutates deep-frozen inputs", () => {
    const fleets: [Placement[], Placement[]] = [fleetA(), fleetB()];
    deepFreeze(fleets);
    const created = createGame({ fleets });
    if (!created.ok) throw new Error("setup failed");
    const mid = mustFire(created.value, 0, { row: 0, col: 0 }).state;
    deepFreeze(mid);
    expect(() => {
      createGame({ fleets });
      fire(mid, 1, { row: 6, col: 6 });
      rematch(mid, fleets);
      const ship = shipAt(mid.players[1].fleet, { row: 0, col: 0 }, mid.rules);
      if (ship) isSunk(ship, mid.rules);
      remainingShips(mid, 1);
      placeShip(fleets[0], { id: "carrier", row: 0, col: 0, orientation: "H" });
      validateFleet(fleets[0]);
      shipCells({ id: "carrier", row: 0, col: 0, orientation: "H" });
      randomPlacement(mulberry32(5), mid.rules);
      orthogonalNeighbors({ row: 0, col: 0 }, mid.rules);
      inBounds({ row: 0, col: 0 }, mid.rules);
      coordLabel({ row: 0, col: 0 });
      parseLabel("A1");
      coordKey({ row: 0, col: 0 });
      sameCoord({ row: 0, col: 0 }, { row: 0, col: 0 });
      randInt(mulberry32(1), 10);
      shipLength("carrier", mid.rules);
    }).not.toThrow();
  });
});
