import { describe, expect, it } from "vitest";

import { CAPTAINS, captainSpec, type CaptainId } from "../../src/engine/captains";
import { coordKey } from "../../src/engine/coords";
import { createGame, fire, rematch } from "../../src/engine/game";
import {
  blastCells,
  powderKegLegal,
  scoutArea,
  useGambit,
  type GambitParams,
} from "../../src/engine/gambit";
import { randomPlacement, shipCells } from "../../src/engine/placement";
import { mulberry32, randInt, type Rng } from "../../src/engine/rng";
import { RULES, type Rules } from "../../src/engine/rules";
import type {
  Coord,
  GameState,
  Placement,
  PlayerIndex,
} from "../../src/engine/types";

const GAMBIT: Rules = { ...RULES, gambit: true };

const fleetA = (): Placement[] => [
  { id: "carrier", row: 0, col: 0, orientation: "H" },
  { id: "battleship", row: 1, col: 0, orientation: "H" },
  { id: "cruiser", row: 2, col: 0, orientation: "H" },
  { id: "submarine", row: 3, col: 0, orientation: "H" },
  { id: "destroyer", row: 4, col: 0, orientation: "H" },
];

const fleetB = (): Placement[] => [
  { id: "carrier", row: 0, col: 0, orientation: "V" },
  { id: "battleship", row: 0, col: 2, orientation: "V" },
  { id: "cruiser", row: 0, col: 4, orientation: "V" },
  { id: "submarine", row: 5, col: 5, orientation: "H" },
  { id: "destroyer", row: 9, col: 8, orientation: "H" },
];

// Like fleetA but the destroyer sits vertical at F6, so a Powder Keg centred
// on it covers both cells inside one blast.
const fleetC = (): Placement[] => [
  { id: "carrier", row: 0, col: 0, orientation: "H" },
  { id: "battleship", row: 1, col: 0, orientation: "H" },
  { id: "cruiser", row: 2, col: 0, orientation: "H" },
  { id: "submarine", row: 3, col: 0, orientation: "H" },
  { id: "destroyer", row: 5, col: 5, orientation: "V" },
];

const BROADSIDE: CaptainId = "captain-broadside";
const POWDERKEG: CaptainId = "captain-powderkeg";
const CROWSNEST: CaptainId = "captain-crowsnest";
const GHOSTSHIP: CaptainId = "captain-ghostship";

function newGame(
  captains: readonly [CaptainId, CaptainId] = [BROADSIDE, POWDERKEG],
  firstPlayer: PlayerIndex = 0,
  fleets: [Placement[], Placement[]] = [fleetA(), fleetB()],
): GameState {
  const r = createGame({ fleets, rules: GAMBIT, captains, firstPlayer });
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

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/**
 * Lets `attacker` land shots on `cells` while the defender fritters away their
 * turns missing into open water. Ends with the turn back on `attacker`.
 */
function batter(
  state: GameState,
  attacker: PlayerIndex,
  cells: readonly Coord[],
  attackerFleet: readonly Placement[],
): GameState {
  const defender = other(attacker);
  const misses = openCells(attackerFleet, cells.length);
  let s = state;
  for (let i = 0; i < cells.length; i++) {
    const shot = cells[i];
    const miss = misses[i];
    if (!shot || !miss) throw new Error("batter: out of cells");
    s = mustFire(s, attacker, shot).state;
    s = mustFire(s, defender, miss).state;
  }
  return s;
}

describe("captains", () => {
  it("lists the four captains with archetypes, gambits and placeholder names", () => {
    expect(CAPTAINS.map((c) => c.id)).toEqual([
      "captain-broadside",
      "captain-powderkeg",
      "captain-crowsnest",
      "captain-ghostship",
    ]);
    expect(CAPTAINS.map((c) => c.archetype)).toEqual([
      "Gunner",
      "Demolitions",
      "Navigator",
      "Trickster",
    ]);
    expect(CAPTAINS.map((c) => c.gambit)).toEqual([
      "broadside",
      "powderkeg",
      "crowsnest",
      "ghostship",
    ]);
    expect(CAPTAINS.map((c) => c.placeholderName)).toEqual([
      "Captain Broadside",
      "Captain Powderkeg",
      "Captain Crow",
      "Captain Ghost",
    ]);
  });

  it("captainSpec resolves ids and throws on unknown ones", () => {
    expect(captainSpec("captain-crowsnest").gambit).toBe("crowsnest");
    expect(() => captainSpec("captain-kidd" as CaptainId)).toThrow();
  });
});

describe("createGame with gambit rules", () => {
  it("requires captains when rules.gambit is on", () => {
    expect(createGame({ fleets: [fleetA(), fleetB()], rules: GAMBIT })).toEqual({
      ok: false,
      error: "missing_captains",
    });
  });

  it("rejects captains when rules.gambit is off", () => {
    expect(
      createGame({ fleets: [fleetA(), fleetB()], captains: [BROADSIDE, POWDERKEG] }),
    ).toEqual({ ok: false, error: "unexpected_captains" });
  });

  it("classic states have no gambit key at all", () => {
    const r = createGame({ fleets: [fleetA(), fleetB()] });
    if (!r.ok) throw new Error("setup failed");
    expect("gambit" in r.value).toBe(false);
    expect(r.value.gambit).toBeUndefined();
  });

  it("gambit states carry the captains and fresh used flags (duplicates allowed)", () => {
    const g = newGame([BROADSIDE, BROADSIDE]);
    expect(g.gambit).toEqual({
      captains: ["captain-broadside", "captain-broadside"],
      used: [false, false],
    });
  });
});

describe("useGambit preconditions", () => {
  it("is gambit_disabled on a classic game", () => {
    const r = createGame({ fleets: [fleetA(), fleetB()] });
    if (!r.ok) throw new Error("setup failed");
    const before = JSON.stringify(r.value);
    expect(
      useGambit(r.value, 0, { kind: "broadside", targets: [] }),
    ).toEqual({ ok: false, error: "gambit_disabled" });
    expect(JSON.stringify(r.value)).toBe(before);
  });

  it("is not_your_turn for the waiting player", () => {
    const g = newGame();
    expect(
      useGambit(g, 1, { kind: "powderkeg", center: { row: 5, col: 5 } }),
    ).toEqual({ ok: false, error: "not_your_turn" });
  });

  it("is wrong_gambit when the params don't match the player's captain", () => {
    const g = newGame([BROADSIDE, POWDERKEG]);
    expect(useGambit(g, 0, { kind: "crowsnest", center: { row: 0, col: 0 } })).toEqual({
      ok: false,
      error: "wrong_gambit",
    });
  });

  it("is already_used on a second use", () => {
    let g = newGame([CROWSNEST, POWDERKEG]);
    const r = useGambit(g, 0, { kind: "crowsnest", center: { row: 0, col: 0 } });
    if (!r.ok) throw new Error("first use failed");
    g = r.value.state; // Crow's Nest is a free action: still player 0's turn
    expect(useGambit(g, 0, { kind: "crowsnest", center: { row: 5, col: 5 } })).toEqual({
      ok: false,
      error: "already_used",
    });
  });

  it("is game_over once the game has ended", () => {
    // Player 0 sinks all but the last cell of player 1's fleet, then lands it.
    const cells = allCells(fleetB());
    let g = batter(newGame(), 0, cells.slice(0, -1), fleetA());
    const last = cells[cells.length - 1];
    if (!last) throw new Error("setup failed");
    g = mustFire(g, 0, last).state;
    expect(g.status).toBe("over");
    expect(
      useGambit(g, 0, { kind: "broadside", targets: [{ row: 6, col: 6 }, { row: 6, col: 7 }, { row: 6, col: 8 }] }),
    ).toEqual({ ok: false, error: "game_over" });
  });
});

describe("blastCells / scoutArea", () => {
  it("blast order is center, up, down, left, right", () => {
    expect(blastCells({ row: 5, col: 5 })).toEqual([
      { row: 5, col: 5 },
      { row: 4, col: 5 },
      { row: 6, col: 5 },
      { row: 5, col: 4 },
      { row: 5, col: 6 },
    ]);
  });

  it("blast clips to 3 cells at a corner and 4 on an edge", () => {
    expect(blastCells({ row: 0, col: 0 })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(blastCells({ row: 9, col: 5 })).toHaveLength(4);
  });

  it("scout area is a clipped 3x3", () => {
    expect(scoutArea({ row: 5, col: 5 })).toHaveLength(9);
    expect(scoutArea({ row: 0, col: 0 })).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
  });
});

describe("broadside", () => {
  it("fires 3 shots in order under one seq, announces first, flips the turn", () => {
    const g = newGame([BROADSIDE, POWDERKEG]);
    const targets: Coord[] = [
      { row: 6, col: 6 }, // water
      { row: 0, col: 0 }, // carrier
      { row: 9, col: 9 }, // destroyer
    ];
    const r = useGambit(g, 0, { kind: "broadside", targets });
    if (!r.ok) throw new Error(`broadside failed: ${r.error}`);
    expect(r.value.events).toEqual([
      { type: "gambit", by: 0, captain: BROADSIDE, gambit: "broadside", seq: 1 },
      { type: "shot", by: 0, coord: { row: 6, col: 6 }, result: "miss", seq: 1 },
      { type: "shot", by: 0, coord: { row: 0, col: 0 }, result: "hit", shipId: "carrier", seq: 1 },
      { type: "shot", by: 0, coord: { row: 9, col: 9 }, result: "hit", shipId: "destroyer", seq: 1 },
    ]);
    const s = r.value.state;
    expect(s.seq).toBe(1);
    expect(s.gambit?.used).toEqual([true, false]);
    expect(s.turn).toBe(1);
    expect(s.players[0].shots).toHaveLength(3);
  });

  it.each([
    {
      name: "fewer than 3 targets",
      targets: [{ row: 1, col: 1 }, { row: 2, col: 2 }],
    },
    {
      name: "more than 3 targets",
      targets: [
        { row: 1, col: 1 },
        { row: 2, col: 2 },
        { row: 3, col: 3 },
        { row: 4, col: 4 },
      ],
    },
    {
      name: "a duplicate target",
      targets: [{ row: 1, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
    },
    {
      name: "an off-board target",
      targets: [{ row: 1, col: 1 }, { row: 2, col: 2 }, { row: 10, col: 2 }],
    },
  ] as { name: string; targets: Coord[] }[])(
    "rejects invalid_targets: $name",
    ({ targets }) => {
      const g = newGame([BROADSIDE, POWDERKEG]);
      const before = JSON.stringify(g);
      expect(useGambit(g, 0, { kind: "broadside", targets })).toEqual({
        ok: false,
        error: "invalid_targets",
      });
      expect(JSON.stringify(g)).toBe(before);
    },
  );

  it("rejects a target the player already fired", () => {
    let g = newGame([BROADSIDE, POWDERKEG]);
    g = mustFire(g, 0, { row: 6, col: 6 }).state;
    g = mustFire(g, 1, { row: 6, col: 6 }).state;
    expect(
      useGambit(g, 0, {
        kind: "broadside",
        targets: [{ row: 6, col: 6 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
      }),
    ).toEqual({ ok: false, error: "invalid_targets" });
  });

  it("stops early when the second target wins the game", () => {
    const defenders = fleetB();
    // Leave the destroyer's last cell (9,9) standing; sink everything else.
    const cells = allCells(defenders).filter((c) => !(c.row === 9 && c.col === 9));
    const g = batter(newGame([BROADSIDE, POWDERKEG]), 0, cells, fleetA());
    const shotsBefore = g.players[0].shots.length;
    const r = useGambit(g, 0, {
      kind: "broadside",
      targets: [
        { row: 6, col: 6 }, // miss
        { row: 9, col: 9 }, // wins
        { row: 7, col: 7 }, // never fired
      ],
    });
    if (!r.ok) throw new Error(`broadside failed: ${r.error}`);
    expect(r.value.state.status).toBe("over");
    expect(r.value.state.winner).toBe(0);
    expect(r.value.state.turn).toBe(0);
    expect(r.value.events.map((e) => e.type)).toEqual([
      "gambit",
      "shot",
      "shot",
      "sunk",
      "gameOver",
    ]);
    // Only 2 of the 3 targets were fired.
    expect(r.value.state.players[0].shots).toHaveLength(shotsBefore + 2);
  });
});

describe("powderkeg", () => {
  it("fires every in-bounds blast cell in order", () => {
    const g = newGame([POWDERKEG, BROADSIDE]);
    const r = useGambit(g, 0, { kind: "powderkeg", center: { row: 2, col: 6 } });
    if (!r.ok) throw new Error(`powderkeg failed: ${r.error}`);
    expect(r.value.events.map((e) => e.type)).toEqual([
      "gambit",
      "shot",
      "shot",
      "shot",
      "shot",
      "shot",
    ]);
    expect(r.value.events[0]).toMatchObject({ captain: POWDERKEG, gambit: "powderkeg" });
    // centre (2,6), up (1,6), down (3,6), left (2,5), right (2,7): all water on fleetB
    expect(r.value.state.players[0].shots.map((s) => s.result)).toEqual([
      "miss",
      "miss",
      "miss",
      "miss",
      "miss",
    ]);
    expect(r.value.state.turn).toBe(1);
  });

  it("clips at a corner and fires only the in-bounds cells", () => {
    const g = newGame([POWDERKEG, BROADSIDE]);
    const r = useGambit(g, 0, { kind: "powderkeg", center: { row: 0, col: 9 } });
    if (!r.ok) throw new Error(`powderkeg failed: ${r.error}`);
    expect(r.value.state.players[0].shots).toHaveLength(3);
  });

  it("rejects an off-board centre", () => {
    const g = newGame([POWDERKEG, BROADSIDE]);
    expect(useGambit(g, 0, { kind: "powderkeg", center: { row: -1, col: 0 } })).toEqual({
      ok: false,
      error: "out_of_bounds",
    });
    expect(powderKegLegal(g, 0, { row: 10, col: 0 })).toEqual({
      ok: false,
      error: "out_of_bounds",
    });
  });

  it("rejects a blast covering an already-fired cell", () => {
    let g = newGame([POWDERKEG, BROADSIDE]);
    g = mustFire(g, 0, { row: 5, col: 5 }).state; // hits the submarine
    g = mustFire(g, 1, { row: 6, col: 6 }).state;
    expect(useGambit(g, 0, { kind: "powderkeg", center: { row: 5, col: 6 } })).toEqual({
      ok: false,
      error: "not_open_water",
    });
  });

  it("rejects a blast touching a known hit on an un-sunk ship", () => {
    let g = newGame([POWDERKEG, BROADSIDE]);
    g = mustFire(g, 0, { row: 0, col: 0 }).state; // hit the carrier, not sunk
    g = mustFire(g, 1, { row: 6, col: 6 }).state;
    // Blast cells of centre (1,1): (1,1),(0,1),(2,1),(1,0),(1,2) — all untried,
    // but (0,1) and (1,0) are orthogonally adjacent to the hit at (0,0).
    expect(useGambit(g, 0, { kind: "powderkeg", center: { row: 1, col: 1 } })).toEqual({
      ok: false,
      error: "not_open_water",
    });
    expect(powderKegLegal(g, 0, { row: 1, col: 1 })).toEqual({
      ok: false,
      error: "not_open_water",
    });
  });

  it("allows a blast touching a hit on an already-sunk ship", () => {
    let g = newGame([POWDERKEG, BROADSIDE]);
    g = mustFire(g, 0, { row: 9, col: 8 }).state; // destroyer hit 1
    g = mustFire(g, 1, { row: 6, col: 6 }).state;
    g = mustFire(g, 0, { row: 9, col: 9 }).state; // destroyer sunk
    g = mustFire(g, 1, { row: 6, col: 7 }).state;
    // Centre (8,7): blast = (8,7),(7,7),(9,7),(8,6),(8,8). (8,8) touches the
    // sunk destroyer's hit at (9,8) — legal because the ship is sunk.
    expect(powderKegLegal(g, 0, { row: 8, col: 7 })).toEqual({
      ok: true,
      value: [
        { row: 8, col: 7 },
        { row: 7, col: 7 },
        { row: 9, col: 7 },
        { row: 8, col: 6 },
        { row: 8, col: 8 },
      ],
    });
    const r = useGambit(g, 0, { kind: "powderkeg", center: { row: 8, col: 7 } });
    expect(r.ok).toBe(true);
  });

  it("still blocks blasts touching hits on a relocated ship, until it is sunk", () => {
    // Conservative rule: hits left behind by a Ghost Ship move still count as
    // known hits on an un-sunk ship, even though no ship is there any more.
    let g = newGame([POWDERKEG, GHOSTSHIP]);
    g = mustFire(g, 0, { row: 0, col: 4 }).state; // hit B's cruiser (V at col 4)
    const moved = useGambit(g, 1, {
      kind: "ghostship",
      to: { id: "cruiser", row: 5, col: 0, orientation: "H" },
    });
    if (!moved.ok) throw new Error("ghostship failed");
    g = moved.value.state;
    // Centre (1,5): blast = (1,5),(0,5),(2,5),(1,4),(1,6) — none fired, but
    // (0,5) and (1,4) touch the stale hit at (0,4). The cruiser is no longer
    // there, yet the blast is still rejected.
    const center = { row: 1, col: 5 };
    expect(powderKegLegal(g, 0, center)).toEqual({
      ok: false,
      error: "not_open_water",
    });
    expect(useGambit(g, 0, { kind: "powderkeg", center })).toEqual({
      ok: false,
      error: "not_open_water",
    });
    // A sinks the cruiser at its new position: the move repaired its one
    // carried hit, so all three new cells must be hit.
    g = mustFire(g, 0, { row: 5, col: 0 }).state;
    g = mustFire(g, 1, { row: 6, col: 6 }).state; // B misses
    g = mustFire(g, 0, { row: 5, col: 1 }).state;
    g = mustFire(g, 1, { row: 6, col: 7 }).state; // B misses
    const sink = mustFire(g, 0, { row: 5, col: 2 });
    expect(sink.events[0]).toMatchObject({ result: "sunk", shipId: "cruiser" });
    g = sink.state;
    // The same centre is legal now: every known hit belongs to a sunk ship.
    expect(powderKegLegal(g, 0, center).ok).toBe(true);
    g = mustFire(g, 1, { row: 6, col: 8 }).state; // B misses, back to A
    const blast = useGambit(g, 0, { kind: "powderkeg", center });
    if (!blast.ok) throw new Error(`powderkeg failed: ${blast.error}`);
    // Every blast cell is a miss — including (1,4), the cruiser's old berth.
    expect(blast.value.events.map((e) => e.type)).toEqual([
      "gambit",
      "shot",
      "shot",
      "shot",
      "shot",
      "shot",
    ]);
    expect(blast.value.state.players[0].shots.slice(-5).map((s) => s.result)).toEqual([
      "miss",
      "miss",
      "miss",
      "miss",
      "miss",
    ]);
  });

  it("sinking the last ship mid-blast ends the game and skips the rest", () => {
    // fleetC: destroyer vertical at (5,5)-(6,5); everything else gets sunk.
    const fleets: [Placement[], Placement[]] = [fleetA(), fleetC()];
    const cells = allCells(fleetC()).filter(
      (c) => !(c.row === 5 && c.col === 5) && !(c.row === 6 && c.col === 5),
    );
    let g = newGame([POWDERKEG, BROADSIDE], 0, fleets);
    g = batter(g, 0, cells, fleets[0]);
    const shotsBefore = g.players[0].shots.length;
    const r = useGambit(g, 0, { kind: "powderkeg", center: { row: 6, col: 5 } });
    if (!r.ok) throw new Error(`powderkeg failed: ${r.error}`);
    // Blast: (6,5) hit, (5,5) sunk -> game over; (7,5),(6,4),(6,6) never fired.
    expect(r.value.events.map((e) => e.type)).toEqual([
      "gambit",
      "shot",
      "shot",
      "sunk",
      "gameOver",
    ]);
    expect(r.value.state.status).toBe("over");
    expect(r.value.state.winner).toBe(0);
    expect(r.value.state.players[0].shots).toHaveLength(shotsBefore + 2);
  });
});

describe("crowsnest", () => {
  it("counts ship cells in the area, announces first, keeps the turn", () => {
    const g = newGame([CROWSNEST, BROADSIDE]);
    // Corner (0,0): area = (0,0),(0,1),(1,0),(1,1). fleetB's carrier occupies
    // (0,0) and (1,0) -> count 2.
    const r = useGambit(g, 0, { kind: "crowsnest", center: { row: 0, col: 0 } });
    if (!r.ok) throw new Error(`crowsnest failed: ${r.error}`);
    expect(r.value.events).toEqual([
      { type: "gambit", by: 0, captain: CROWSNEST, gambit: "crowsnest", seq: 1 },
      { type: "scout", by: 0, center: { row: 0, col: 0 }, count: 2, seq: 1 },
    ]);
    const s = r.value.state;
    expect(s.seq).toBe(1);
    expect(s.gambit?.used).toEqual([true, false]);
    expect(s.turn).toBe(0); // free action — player still has their normal shot
  });

  it("leaks no positions or ship ids in the scout event", () => {
    const g = newGame([CROWSNEST, BROADSIDE]);
    const r = useGambit(g, 0, { kind: "crowsnest", center: { row: 4, col: 4 } });
    if (!r.ok) throw new Error("failed");
    const scout = r.value.events[1];
    expect(scout && Object.keys(scout).sort()).toEqual([
      "by",
      "center",
      "count",
      "seq",
      "type",
    ]);
  });

  it("counts cells that were already hit", () => {
    let g = newGame([CROWSNEST, BROADSIDE]);
    g = mustFire(g, 0, { row: 0, col: 0 }).state; // hit the carrier
    g = mustFire(g, 1, { row: 6, col: 6 }).state;
    const r = useGambit(g, 0, { kind: "crowsnest", center: { row: 0, col: 0 } });
    if (!r.ok) throw new Error("failed");
    expect(r.value.events[1]).toMatchObject({ type: "scout", count: 2 });
  });

  it("lets the player fire a normal shot afterwards", () => {
    let g = newGame([CROWSNEST, BROADSIDE]);
    const r = useGambit(g, 0, { kind: "crowsnest", center: { row: 5, col: 5 } });
    if (!r.ok) throw new Error("failed");
    g = r.value.state;
    const shot = fire(g, 0, { row: 0, col: 0 });
    expect(shot.ok).toBe(true);
    if (shot.ok) {
      expect(shot.value.state.turn).toBe(1);
      expect(shot.value.state.seq).toBe(2);
    }
  });

  it("rejects an off-board centre", () => {
    const g = newGame([CROWSNEST, BROADSIDE]);
    expect(useGambit(g, 0, { kind: "crowsnest", center: { row: 10, col: 5 } })).toEqual({
      ok: false,
      error: "out_of_bounds",
    });
  });
});

describe("ghostship", () => {
  // Player 1 is the Trickster; player 0 damages their cruiser first.
  function ghostGame(): GameState {
    let g = newGame([BROADSIDE, GHOSTSHIP]);
    g = mustFire(g, 0, { row: 0, col: 4 }).state; // hit the cruiser (V at col 4)
    return g;
  }

  it("moves a damaged ship, repairs one hit, announces the name only", () => {
    let g = ghostGame(); // cruiser hit once at (0,4)
    g = mustFire(g, 1, { row: 6, col: 6 }).state; // B misses
    g = mustFire(g, 0, { row: 1, col: 4 }).state; // second hit on the cruiser
    const r = useGambit(g, 1, {
      kind: "ghostship",
      to: { id: "cruiser", row: 5, col: 0, orientation: "H" },
    });
    if (!r.ok) throw new Error(`ghostship failed: ${r.error}`);
    expect(r.value.events).toEqual([
      { type: "gambit", by: 1, captain: GHOSTSHIP, gambit: "ghostship", seq: 4 },
      { type: "relocated", by: 1, shipId: "cruiser", seq: 4 },
    ]);
    const s = r.value.state;
    const cruiser = s.players[1].fleet.find((x) => x.id === "cruiser");
    // Two hits carried minus one repaired: hits is 1 at the new berth.
    expect(cruiser).toMatchObject({ row: 5, col: 0, orientation: "H", hits: 1 });
    expect(s.turn).toBe(0);
    // Opponent's shot history is untouched.
    expect(s.players[0].shots).toEqual([
      { coord: { row: 0, col: 4 }, result: "hit", shipId: "cruiser" },
      { coord: { row: 1, col: 4 }, result: "hit", shipId: "cruiser" },
    ]);
    // And it sinks after exactly 2 more hits at its new cells.
    let g2 = mustFire(s, 0, { row: 5, col: 0 }).state; // hits: 2
    g2 = mustFire(g2, 1, { row: 6, col: 7 }).state;
    const last = mustFire(g2, 0, { row: 5, col: 1 }); // hits: 3 -> sunk
    expect(last.events.map((e) => e.type)).toEqual(["shot", "sunk"]);
    expect(last.events[0]).toMatchObject({ result: "sunk", shipId: "cruiser" });
  });

  it("sinks the moved ship only after all of its new cells are hit", () => {
    let g = ghostGame();
    const r = useGambit(g, 1, {
      kind: "ghostship",
      to: { id: "cruiser", row: 5, col: 0, orientation: "H" },
    });
    if (!r.ok) throw new Error("failed");
    g = r.value.state;
    // One hit was repaired: the cruiser carries hits 0 into the new berth.
    const cruiser = g.players[1].fleet.find((x) => x.id === "cruiser");
    expect(cruiser?.hits).toBe(0);
    // Old position is now water.
    const atOld = mustFire(g, 0, { row: 1, col: 4 });
    expect(atOld.events[0]).toMatchObject({ result: "miss" });
    g = mustFire(atOld.state, 1, { row: 6, col: 6 }).state;
    // All three new cells must be hit to sink the 3-length cruiser.
    g = mustFire(g, 0, { row: 5, col: 0 }).state; // hits: 1
    g = mustFire(g, 1, { row: 6, col: 7 }).state;
    g = mustFire(g, 0, { row: 5, col: 1 }).state; // hits: 2
    g = mustFire(g, 1, { row: 6, col: 8 }).state;
    const last = mustFire(g, 0, { row: 5, col: 2 }); // hits: 3 -> sunk
    expect(last.events.map((e) => e.type)).toEqual(["shot", "sunk"]);
    expect(last.events[0]).toMatchObject({ result: "sunk", shipId: "cruiser" });
  });

  it("rejects moving a sunk ship", () => {
    let g = newGame([BROADSIDE, GHOSTSHIP]);
    g = mustFire(g, 0, { row: 9, col: 8 }).state;
    g = mustFire(g, 1, { row: 6, col: 6 }).state;
    g = mustFire(g, 0, { row: 9, col: 9 }).state; // destroyer sunk
    expect(
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "destroyer", row: 5, col: 0, orientation: "H" },
      }),
    ).toEqual({ ok: false, error: "ship_sunk" });
  });

  it("rejects an unknown ship id", () => {
    const g = ghostGame();
    expect(
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "schooner" as never, row: 5, col: 0, orientation: "H" },
      }),
    ).toEqual({ ok: false, error: "unknown_ship" });
  });

  it("rejects the same position", () => {
    const g = ghostGame();
    expect(
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "cruiser", row: 0, col: 4, orientation: "V" },
      }),
    ).toEqual({ ok: false, error: "same_position" });
  });

  it("rejects an illegal position (off the grid or overlapping its own fleet)", () => {
    const g = ghostGame();
    // Cruiser length 3 at (9,8) H hangs off the right edge.
    expect(
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "cruiser", row: 9, col: 8, orientation: "H" },
      }),
    ).toEqual({ ok: false, error: "illegal_position" });
    // (5,5) H overlaps the submarine at (5,5)-(5,7).
    expect(
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "cruiser", row: 5, col: 5, orientation: "H" },
      }),
    ).toEqual({ ok: false, error: "illegal_position" });
  });

  it("rejects a position covering a cell the opponent already fired at", () => {
    let g = newGame([BROADSIDE, GHOSTSHIP]);
    g = mustFire(g, 0, { row: 6, col: 6 }).state; // a miss on open water
    // Moving the submarine to cover the missed cell (6,6) is illegal.
    expect(
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "submarine", row: 6, col: 5, orientation: "H" },
      }),
    ).toEqual({ ok: false, error: "fired_cell" });
  });

  it("rejects a position covering an old hit cell", () => {
    const g = ghostGame(); // cruiser hit at (0,4)
    // Rotate the cruiser horizontally at the same origin: covers the hit (0,4).
    expect(
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "cruiser", row: 0, col: 4, orientation: "H" },
      }),
    ).toEqual({ ok: false, error: "fired_cell" });
  });
});

describe("rematch", () => {
  it("keeps captains, resets used, and alternates firstPlayer", () => {
    let g = newGame([BROADSIDE, CROWSNEST], 0);
    const used = useGambit(g, 0, {
      kind: "broadside",
      targets: [{ row: 6, col: 6 }, { row: 7, col: 7 }, { row: 8, col: 8 }],
    });
    if (!used.ok) throw new Error("gambit failed");
    g = used.value.state;
    const m1 = rematch(g, [fleetA(), fleetB()]);
    if (!m1.ok) throw new Error("rematch failed");
    expect(m1.value.firstPlayer).toBe(1);
    expect(m1.value.gambit).toEqual({
      captains: ["captain-broadside", "captain-crowsnest"],
      used: [false, false],
    });
    const m2 = rematch(m1.value, [fleetA(), fleetB()]);
    if (!m2.ok) throw new Error("rematch 2 failed");
    expect(m2.value.firstPlayer).toBe(0);
  });

  it("classic rematch still has no gambit key", () => {
    const r = createGame({ fleets: [fleetA(), fleetB()] });
    if (!r.ok) throw new Error("setup failed");
    const m = rematch(r.value, [fleetA(), fleetB()]);
    if (!m.ok) throw new Error("rematch failed");
    expect("gambit" in m.value).toBe(false);
  });
});

describe("immutability", () => {
  it("useGambit never mutates deep-frozen state", () => {
    let g = newGame([BROADSIDE, GHOSTSHIP]);
    g = mustFire(g, 0, { row: 0, col: 4 }).state;
    deepFreeze(g);
    expect(() => {
      useGambit(g, 1, {
        kind: "ghostship",
        to: { id: "cruiser", row: 5, col: 0, orientation: "H" },
      });
      useGambit(g, 1, { kind: "powderkeg", center: { row: 3, col: 3 } }); // wrong_gambit
      useGambit(g, 1, { kind: "ghostship", to: { id: "cruiser", row: 0, col: 4, orientation: "V" } }); // same_position
    }).not.toThrow();
  });
});

describe("seeded simulation", () => {
  const CAPTAIN_IDS: CaptainId[] = [BROADSIDE, POWDERKEG, CROWSNEST, GHOSTSHIP];

  function untriedCells(s: GameState, p: PlayerIndex): Coord[] {
    const fired = new Set(s.players[p].shots.map((x) => coordKey(x.coord)));
    const out: Coord[] = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const c = { row, col };
        if (!fired.has(coordKey(c))) out.push(c);
      }
    }
    return out;
  }

  function randomParams(rng: Rng, s: GameState, p: PlayerIndex): GambitParams | null {
    const gs = s.gambit;
    if (!gs) return null;
    const kind = captainSpec(gs.captains[p]).gambit;
    switch (kind) {
      case "broadside": {
        const pool = untriedCells(s, p);
        if (pool.length < 3) return null;
        const picks: Coord[] = [];
        const copy = [...pool];
        for (let i = 0; i < 3; i++) {
          picks.push(copy.splice(randInt(rng, copy.length), 1)[0] as Coord);
        }
        return { kind: "broadside", targets: picks };
      }
      case "powderkeg":
        return {
          kind: "powderkeg",
          center: { row: randInt(rng, 10), col: randInt(rng, 10) },
        };
      case "crowsnest":
        return {
          kind: "crowsnest",
          center: { row: randInt(rng, 10), col: randInt(rng, 10) },
        };
      case "ghostship": {
        const ship = s.players[p].fleet[randInt(rng, s.players[p].fleet.length)];
        if (!ship) return null;
        return {
          kind: "ghostship",
          to: {
            id: ship.id,
            row: randInt(rng, 10),
            col: randInt(rng, 10),
            orientation: randInt(rng, 2) === 0 ? "H" : "V",
          },
        };
      }
    }
  }

  it("plays 200 terminating games where no side uses a Gambit twice", () => {
    const gambitsUsed = new Set<string>();
    let gambitCount = 0;
    for (let seed = 0; seed < 200; seed++) {
      const rng = mulberry32(seed);
      const fleets: [Placement[], Placement[]] = [
        randomPlacement(rng),
        randomPlacement(rng),
      ];
      const captains: [CaptainId, CaptainId] = [
        CAPTAIN_IDS[randInt(rng, 4)] ?? BROADSIDE,
        CAPTAIN_IDS[randInt(rng, 4)] ?? POWDERKEG,
      ];
      const created = createGame({
        fleets,
        rules: GAMBIT,
        captains,
        firstPlayer: (seed % 2) as PlayerIndex,
      });
      if (!created.ok) throw new Error("createGame failed");
      let s = created.value;
      const usedCount: [number, number] = [0, 0];
      let guard = 0;
      while (s.status === "playing" && guard++ < 500) {
        const p = s.turn;
        if (s.gambit && !s.gambit.used[p] && rng() < 0.15) {
          for (let attempt = 0; attempt < 8 && s.status === "playing"; attempt++) {
            const params = randomParams(rng, s, p);
            if (!params) break;
            const r = useGambit(s, p, params);
            if (r.ok) {
              s = r.value.state;
              usedCount[p]++;
              gambitCount++;
              gambitsUsed.add(params.kind);
              break;
            }
            if (
              r.error === "gambit_disabled" ||
              r.error === "game_over" ||
              r.error === "not_your_turn" ||
              r.error === "already_used" ||
              r.error === "wrong_gambit"
            ) {
              throw new Error(`unexpected gambit error: ${r.error}`);
            }
            // kind-specific rejection: retry with fresh params
          }
        }
        if (s.status === "playing" && s.turn === p) {
          const pool = untriedCells(s, p);
          const c = pool[randInt(rng, pool.length)];
          if (!c) throw new Error("no untried cells but game still playing");
          s = mustFire(s, p, c).state;
        }
      }
      expect(guard).toBeLessThan(500);
      expect(s.status).toBe("over");
      expect(s.winner).not.toBeNull();
      expect(usedCount[0]).toBeLessThanOrEqual(1);
      expect(usedCount[1]).toBeLessThanOrEqual(1);
      expect(s.gambit?.used[0] ? 1 : 0).toBe(usedCount[0]);
      expect(s.gambit?.used[1] ? 1 : 0).toBe(usedCount[1]);
    }
    // The simulation actually exercised every Gambit kind.
    expect(gambitsUsed).toEqual(
      new Set(["broadside", "powderkeg", "crowsnest", "ghostship"]),
    );
    expect(gambitCount).toBeGreaterThan(50);
  });
});
