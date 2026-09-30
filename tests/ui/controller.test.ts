import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/engine/rng";
import { shipCells } from "../../src/engine/placement";
import type { Coord, Placement } from "../../src/engine/types";
import {
  createBattleController,
  pirateLine,
  type BattleView,
} from "../../src/ui/battle/controller";

function spyView() {
  const calls: {
    reticles: (Coord | null)[];
    shakes: number;
    shots: { side: string; coord: Coord; result: string; shipId?: string }[];
    reveals: Placement[];
    banners: string[];
    gameOvers: number[];
    ownFleet: readonly Placement[] | null;
  } = {
    reticles: [],
    shakes: 0,
    shots: [],
    reveals: [],
    banners: [],
    gameOvers: [],
    ownFleet: null,
  };
  const view: BattleView = {
    setReticle: (c) => void calls.reticles.push(c),
    shakeReticle: () => void calls.shakes++,
    applyShot: (side, s) =>
      void calls.shots.push({
        side,
        coord: s.coord,
        result: s.result,
        ...(s.shipId !== undefined ? { shipId: s.shipId } : {}),
      }),
    revealShip: (p) => void calls.reveals.push(p),
    setOwnFleet: (p) => void (calls.ownFleet = p),
    banner: (t) => void calls.banners.push(t),
    gameOver: (w) => void calls.gameOvers.push(w),
  };
  return { view, calls };
}

function make(seed = 7) {
  const spy = spyView();
  const ctrl = createBattleController({
    view: spy.view,
    rng: mulberry32(seed),
    schedule: (cb) => cb(), // synchronous AI reply for tests
    debug: true,
  });
  return { ctrl, calls: spy.calls };
}

describe("battle controller", () => {
  it("resolves a player shot through the engine and marks the enemy grid", () => {
    const { ctrl, calls } = make();
    expect(calls.ownFleet).toHaveLength(5);
    const before = calls.shots.length;
    const ok = ctrl.fireAt({ row: 0, col: 0 });
    expect(ok).toBe(true);
    // our shot on the enemy grid + the AI's synchronous reply on ours
    expect(calls.shots[before]).toMatchObject({
      side: "enemy",
      coord: { row: 0, col: 0 },
    });
    expect(calls.shots[before + 1]?.side).toBe("player");
    expect(ctrl.state().players[0].shots).toHaveLength(1);
    expect(calls.banners.at(-1)).toMatch(/[A-J]\d+/);
  });

  it("rejects repeats and shakes the reticle instead of firing", () => {
    const { ctrl, calls } = make();
    ctrl.fireAt({ row: 0, col: 0 });
    const n = calls.shots.length;
    expect(ctrl.fireAt({ row: 0, col: 0 })).toBe(false);
    expect(calls.shots).toHaveLength(n);
    expect(calls.shakes).toBeGreaterThan(0);
  });

  it("never reveals the enemy fleet before a sink", () => {
    const { ctrl, calls } = make();
    // fire at a few random water cells (fleet spy stays empty of reveals)
    for (const c of [
      { row: 2, col: 2 },
      { row: 5, col: 5 },
      { row: 8, col: 1 },
    ]) {
      ctrl.fireAt(c);
    }
    expect(calls.reveals).toHaveLength(0);
    // and the view only ever received shot markers, never placements
    expect(calls.shots.every((s) => !("orientation" in s))).toBe(true);
  });

  it("reveals an enemy ship only when the engine reports it sunk", () => {
    const { ctrl, calls } = make();
    const target = ctrl.enemyFleet().find((p) => p.id === "destroyer")!;
    const cells = shipCells(target);
    // fire all but the last cell — may already hit, but no reveal yet
    for (const c of cells.slice(0, -1)) {
      ctrl.fireAt(c);
    }
    expect(calls.reveals).toHaveLength(0);
    ctrl.fireAt(cells[cells.length - 1]!);
    expect(calls.reveals).toHaveLength(1);
    expect(calls.reveals[0]).toMatchObject({ id: "destroyer" });
  });

  it("fires exactly one AI reply per player turn and nothing after game over", () => {
    const { ctrl, calls } = make();
    // sink the whole enemy fleet through the debug accessor
    const fleet = ctrl.enemyFleet();
    let playerShots = 0;
    for (const p of fleet) {
      for (const c of shipCells(p)) {
        const aiBefore = calls.shots.filter((s) => s.side === "player").length;
        const fired = ctrl.fireAt(c);
        if (fired) playerShots++;
        const aiAfter = calls.shots.filter((s) => s.side === "player").length;
        // each accepted player shot triggers at most one AI shot
        expect(aiAfter - aiBefore).toBeLessThanOrEqual(1);
      }
    }
    expect(ctrl.state().status).toBe("over");
    expect(ctrl.state().winner).toBe(0);
    expect(calls.gameOvers).toEqual([0]);
    const n = calls.shots.length;
    expect(ctrl.fireAt({ row: 0, col: 0 })).toBe(false);
    expect(calls.shots).toHaveLength(n);
    expect(playerShots).toBeGreaterThan(10);
  });

  it("hides the reticle while the AI is thinking or the game is over", () => {
    const spy = spyView();
    let pending: (() => void) | null = null;
    const ctrl = createBattleController({
      view: spy.view,
      rng: mulberry32(3),
      schedule: (cb) => {
        pending = cb;
      },
      debug: false,
    });
    ctrl.fireAt({ row: 0, col: 0 });
    ctrl.hover({ row: 1, col: 1 });
    expect(spy.calls.reticles.at(-1)).toBeNull(); // AI turn: no reticle
    pending!(); // let the AI reply
    ctrl.hover({ row: 1, col: 1 });
    expect(spy.calls.reticles.at(-1)).toEqual({ row: 1, col: 1 });
    // debug accessor off without the flag
    expect(ctrl.enemyFleet()).toEqual([]);
  });
});

describe("pirate lines", () => {
  it("keeps the plain coordinate first, then flavour", () => {
    expect(pirateLine("enemy", "B7", { result: "miss" })).toBe(
      "B7 — Splash! Nothing but brine.",
    );
    expect(
      pirateLine("enemy", "B7", { result: "hit", shipId: "cruiser" }),
    ).toBe("B7 — Direct hit! Their Frigate takes a ball!");
    expect(
      pirateLine("enemy", "B7", { result: "sunk", shipId: "battleship" }),
    ).toBe("B7 — Ye sank their Galleon!");
    expect(
      pirateLine("player", "C4", { result: "hit", shipId: "destroyer" }),
    ).toBe("They fire C4 — our Sloop is holed!");
  });
});

// Rows A, C, E, G, I — every ship horizontal from column 1.
const ROWS_FLEET: readonly Placement[] = [
  { id: "carrier", row: 0, col: 0, orientation: "H" },
  { id: "battleship", row: 2, col: 0, orientation: "H" },
  { id: "cruiser", row: 4, col: 0, orientation: "H" },
  { id: "submarine", row: 6, col: 0, orientation: "H" },
  { id: "destroyer", row: 8, col: 0, orientation: "H" },
];

function makeGambit(
  captains: readonly [
    "captain-broadside" | "captain-powderkeg" | "captain-crowsnest" | "captain-ghostship",
    "captain-broadside" | "captain-powderkeg" | "captain-crowsnest" | "captain-ghostship",
  ],
  opts: { hold?: boolean; seed?: number } = {},
) {
  const spy = spyView();
  const extra = {
    scouts: [] as { center: Coord; count: number; by: number }[],
    moves: [] as { from: Placement; to: Placement }[],
    relocated: [] as string[],
  };
  let pending: (() => void) | null = null;
  const ctrl = createBattleController({
    view: {
      ...spy.view,
      scout: (center, count, by) => void extra.scouts.push({ center, count, by }),
      moveOwnShip: (from, to) => void extra.moves.push({ from, to }),
      enemyRelocated: (id) => void extra.relocated.push(id),
    },
    rng: mulberry32(opts.seed ?? 11),
    schedule: opts.hold ? (cb) => void (pending = cb) : (cb) => cb(),
    fleets: [ROWS_FLEET, ROWS_FLEET],
    gambit: true,
    captains,
    debug: true,
  });
  return { ctrl, calls: spy.calls, extra, runAi: () => pending?.() };
}

describe("battle controller — Gambit mode", () => {
  it("has no Gambit in Standard mode", () => {
    const { ctrl } = make();
    expect(ctrl.gambitStatus()).toBeNull();
    expect(ctrl.state().gambit).toBeUndefined();
  });

  it("shows Ready, then Unavailable during the AI turn, then Spent", () => {
    const { ctrl, runAi } = makeGambit(["captain-broadside", "captain-crowsnest"], { hold: true });
    expect(ctrl.gambitStatus()).toMatchObject({ kind: "broadside", name: "Broadside", state: "ready" });
    ctrl.fireAt({ row: 9, col: 9 });
    expect(ctrl.gambitStatus()).toMatchObject({ state: "unavailable", reason: "Wait for your turn" });
    expect(ctrl.useGambit({ kind: "broadside", targets: [] })).toEqual({ ok: false, error: "busy" });
    runAi();
    expect(ctrl.gambitStatus()?.state).toBe("ready");
    const targets = [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 0, col: 1 }];
    expect(ctrl.useGambit({ kind: "broadside", targets }).ok).toBe(true);
    runAi();
    expect(ctrl.gambitStatus()).toMatchObject({ state: "spent" });
  });

  it("Broadside fires three shots on the enemy grid and names the hit", () => {
    const { ctrl, calls } = makeGambit(["captain-broadside", "captain-crowsnest"]);
    const bad = ctrl.checkGambit({ kind: "broadside", targets: [{ row: 1, col: 1 }] });
    expect(bad).toEqual({ ok: false, error: "invalid_targets" });
    const before = calls.shots.length;
    const targets = [{ row: 1, col: 1 }, { row: 0, col: 3 }, { row: 5, col: 5 }];
    expect(ctrl.useGambit({ kind: "broadside", targets }).ok).toBe(true);
    const ours = calls.shots.slice(before).filter((s) => s.side === "enemy");
    expect(ours).toHaveLength(3);
    expect(ours[1]).toMatchObject({ result: "hit", shipId: "carrier" });
    expect(calls.banners.some((b) => b.includes("invokes Broadside"))).toBe(true);
    expect(ctrl.state().players[0].shots).toHaveLength(3);
  });

  it("Powder Keg is refused next to a known hit and legal in open water", () => {
    const { ctrl } = makeGambit(["captain-powderkeg", "captain-crowsnest"]);
    ctrl.fireAt({ row: 4, col: 1 }); // hit the Frigate
    expect(ctrl.checkGambit({ kind: "powderkeg", center: { row: 5, col: 1 } })).toEqual({
      ok: false,
      error: "not_open_water",
    });
    expect(ctrl.checkGambit({ kind: "powderkeg", center: { row: 1, col: 7 } }).ok).toBe(true);
    // a dry run never changes the game
    expect(ctrl.state().gambit?.used[0]).toBe(false);
  });

  it("Crow's Nest counts ship squares and leaves the shot to the player", () => {
    const { ctrl, extra } = makeGambit(["captain-crowsnest", "captain-broadside"]);
    expect(ctrl.useGambit({ kind: "crowsnest", center: { row: 1, col: 1 } }).ok).toBe(true);
    expect(extra.scouts).toEqual([{ center: { row: 1, col: 1 }, count: 6, by: 0 }]);
    expect(ctrl.busy()).toBe(false);
    expect(ctrl.state().turn).toBe(0);
    expect(ctrl.fireAt({ row: 1, col: 1 })).toBe(true);
  });

  it("Ghost Ship moves our ship, patches a hole, and the report follows it", () => {
    const { ctrl, extra } = makeGambit(["captain-ghostship", "captain-crowsnest"], { seed: 5 });
    // play plain turns until the AI has holed one of our ships
    let col = 0;
    let row = 9;
    while (!ctrl.state().players[1].shots.some((s) => s.result === "hit")) {
      ctrl.fireAt({ row, col });
      col++;
      if (col === 10) { col = 0; row -= 2; }
    }
    const hurt = ctrl.state().players[0].fleet.find((s) => s.hits > 0)!;
    const fired = ctrl.firedAt("player");
    // find a free berth for it
    let to: Placement | null = null;
    for (let r = 0; r < 10 && !to; r++) {
      for (let c = 0; c < 10 && !to; c++) {
        const cand = { id: hurt.id, row: r, col: c, orientation: "V" as const };
        if (ctrl.checkGambit({ kind: "ghostship", to: cand }).ok) to = cand;
      }
    }
    expect(to).not.toBeNull();
    expect(shipCells(to!).some((c) => fired.has(`${c.row},${c.col}`))).toBe(false);
    expect(ctrl.useGambit({ kind: "ghostship", to: to! }).ok).toBe(true);
    expect(extra.moves.at(-1)).toMatchObject({ from: { id: hurt.id }, to });
    const rep = ctrl.fleetReport().own.find((s) => s.id === hurt.id)!;
    expect(rep.hits).toBe(hurt.hits - 1);
    expect(rep.segments.filter(Boolean)).toHaveLength(hurt.hits - 1);
  });

  it("the AI invokes its own Gambit and the player sees it announced", () => {
    const { ctrl, calls } = makeGambit(["captain-crowsnest", "captain-powderkeg"]);
    ctrl.fireAt({ row: 9, col: 9 });
    // Powder Keg in hunt mode fires on its first turn: 5 shots on our grid
    expect(calls.shots.filter((s) => s.side === "player").length).toBeGreaterThanOrEqual(4);
    expect(calls.banners.some((b) => /Capt\. Kindle invokes Powder Keg/.test(b))).toBe(true);
    expect(ctrl.state().gambit?.used[1]).toBe(true);
  });
});

describe("fleet report", () => {
  it("marks exactly the squares the AI hit on our ships", () => {
    const { ctrl } = makeGambit(["captain-crowsnest", "captain-broadside"], { seed: 3 });
    for (let i = 0; i < 30 && ctrl.state().status === "playing"; i++) {
      ctrl.fireAt({ row: 9 - (i % 2) * 2, col: Math.floor(i / 2) % 10 }); // open water rows J, H
    }
    const incoming = ctrl.state().players[1].shots;
    for (const rep of ctrl.fleetReport().own) {
      const p = ROWS_FLEET.find((q) => q.id === rep.id)!;
      const want = shipCells(p).map((c) =>
        incoming.some((s) => s.result !== "miss" && s.coord.row === c.row && s.coord.col === c.col),
      );
      expect(rep.segments).toEqual(want);
      expect(rep.exact).toBe(true);
    }
  });

  it("counts our named hits on enemy ships without revealing squares, and sinks", () => {
    const { ctrl } = makeGambit(["captain-crowsnest", "captain-broadside"]);
    ctrl.fireAt({ row: 0, col: 2 });
    let rep = ctrl.fleetReport().enemy.find((s) => s.id === "carrier")!;
    expect(rep).toMatchObject({ hits: 1, sunk: false, exact: false });
    expect(rep.segments).toEqual([true, false, false, false, false]);
    ctrl.fireAt({ row: 8, col: 0 });
    ctrl.fireAt({ row: 8, col: 1 });
    rep = ctrl.fleetReport().enemy.find((s) => s.id === "destroyer")!;
    expect(rep).toMatchObject({ hits: 2, sunk: true, exact: true });
  });
});
