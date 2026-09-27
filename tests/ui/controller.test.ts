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
