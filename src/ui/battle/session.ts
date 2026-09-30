import {
  blastCells,
  captainSpec,
  coordKey,
  isSunk,
  randomPlacement,
  RULES,
  sameCoord,
  scoutArea,
  shipCells,
  shipLength,
  type CaptainId,
  type Coord,
  type GambitError,
  type GameEvent,
  type Orientation,
  type Placement,
  type PlayerIndex,
  type Rng,
  type ShipId,
} from "../../engine/index";
import type { Difficulty } from "../../ai/shot";
import { createBattleController, SHIP_NAMES, type BattleController, type BattleView } from "./controller";
import type { HudHandles } from "./hud";
import { anchoredPlacement, createPlacement } from "./placement";
import { logLine, sidebarModel } from "./sidebarModel";
import type { SidebarHandles } from "./sidebar";

type Grid = "player" | "enemy";
type Tone = "valid" | "invalid" | "target" | "scout";

/** What the session needs from the 3D board (structurally the BoardView). */
export interface SceneSurface extends Omit<BattleView, "banner" | "gameOver" | "events"> {
  setPreview(grid: Grid, tiles: readonly { cell: Coord; tone: Tone }[]): void;
  setGhost(p: Placement | null, valid?: boolean): void;
  /** dim veil over the enemy grid during placement */
  setEnemyFog(visible: boolean): void;
  focus(which: "own" | "enemy" | "all"): void;
  onHover(cb: (cell: Coord | null, grid: Grid | null) => void): void;
  onFire(cb: (cell: Coord, grid: Grid) => void): void;
}

export interface SessionOpts {
  scene: SceneSurface;
  hud: HudHandles;
  rng: Rng;
  difficulty: Difficulty;
  captains: readonly [CaptainId, CaptainId];
  gambit: boolean;
  debug?: boolean;
  /** debug: skip placement with fixed fleets */
  fleets?: readonly [readonly Placement[], readonly Placement[]];
  /** right-column sidebar: waters chart, tally, captain's log */
  sidebar?: SidebarHandles;
}

type Aim =
  | { kind: "broadside"; picks: Coord[] }
  | { kind: "powderkeg" }
  | { kind: "crowsnest" }
  | { kind: "ghostship"; ship: ShipId | null; orientation: Orientation };

const GAMBIT_WHY: Partial<Record<GambitError | "busy", string>> = {
  busy: "Wait for your turn.",
  not_open_water: "Open water only: no blast square may be fired at already, or touch a hit on a ship still afloat.",
  invalid_targets: "Pick 3 different squares you haven't fired at.",
  fired_cell: "Can't berth on squares the enemy has fired at.",
  illegal_position: "That berth overlaps another of your ships.",
  same_position: "Pick a new berth — she's already there.",
  ship_sunk: "That ship is already sunk.",
  out_of_bounds: "Stay on the chart.",
};

export interface Session {
  phase(): "placement" | "battle";
  /** sidebar buttons (boot late-binds the HUD to these) */
  selectShip(id: ShipId): void;
  rotate(): void;
  randomize(): void;
  clear(): void;
  start(): void;
  gambit(): void;
  /** debug accessors */
  controller(): BattleController | null;
  autoPlace(): void;
  /** debug: select ship `id` and click `cell` (placement phase only) */
  debugPlace(id: ShipId, cell: Coord, orientation?: Orientation): void;
  /** debug: hover a square of our grid (placement phase only) */
  debugHover(cell: Coord | null): void;
  dispose(): void;
}

export function createSession(o: SessionOpts): Session {
  const { scene, hud, rng } = o;
  const pc = createPlacement(rng);
  let ctrl: BattleController | null = null;
  let aim: Aim | null = null;
  let hover: { cell: Coord; grid: Grid } | null = null;

  // ---------------- placement ----------------
  function renderPlacement() {
    scene.setOwnFleet(pc.placed());
    const pv = pc.preview();
    const sel = pc.selected();
    if (pv) {
      scene.setPreview("player", pv.cells.map((cell) => ({ cell, tone: pv.valid ? "valid" : "invalid" })));
      scene.setGhost(pv.placement, pv.valid);
    } else {
      const under = !sel && hover?.grid === "player" ? pc.shipAt(hover.cell) : undefined;
      scene.setPreview("player", under ? shipCells(under).map((cell) => ({ cell, tone: "target" as const })) : []);
      scene.setGhost(null);
    }
    hud.placement({
      ships: RULES.fleet.map((s) => ({
        id: s.id,
        length: s.length,
        placed: pc.placed().some((p) => p.id === s.id),
        selected: sel === s.id,
      })),
      orientation: pc.orientation(),
      complete: pc.complete(),
    });
    o.sidebar?.updateWaters(pc.placed());
  }

  function placementBanner() {
    const sel = pc.selected();
    hud.banner(
      pc.complete()
        ? "Fleet deployed! Click a ship to move it, or Set Sail when ready."
        : sel
          ? `Place yer ${SHIP_NAMES[sel]} (${shipLength(sel)} squares) — ${pc.orientation() === "H" ? "across" : "down"}. R to rotate.`
          : "Pick a ship from the dock.",
    );
  }

  function placementClick(cell: Coord, grid: Grid) {
    if (grid !== "player") return;
    const r = pc.click(cell);
    if (r === "invalid") {
      scene.shakeReticle();
      hud.banner(`No room there — she'd overlap another ship. Try another berth.`);
    } else {
      placementBanner();
    }
    renderPlacement();
  }

  // ---------------- battle ----------------
  function startBattle(fleets: readonly [readonly Placement[], readonly Placement[]]) {
    scene.setPreview("player", []);
    scene.setGhost(null);
    scene.setEnemyFog(false);
    hover = null;
    const view: BattleView = {
      ...scene,
      banner: (t) => hud.banner(t),
      gameOver: (w) => {
        hud.gameOver(w === 0);
        hud.say("own", w === 0 ? "victory" : "defeat");
        hud.say("enemy", w === 0 ? "defeat" : "victory");
        refresh();
      },
      events: onEvents,
    };
    ctrl = createBattleController({
      view,
      rng,
      fleets,
      difficulty: o.difficulty,
      captains: o.captains,
      gambit: o.gambit,
      debug: o.debug,
    });
    scene.focus("all");
    hud.battle();
    hud.say("own", "select");
    hud.say("enemy", "select");
    o.sidebar?.pushLog("The battle begins. You fire first.");
    refresh();
  }

  function onEvents(by: PlayerIndex, events: readonly GameEvent[]) {
    const me = by === 0 ? "own" : "enemy";
    const them = by === 0 ? "enemy" : "own";
    const shots = events.filter((e) => e.type === "shot");
    if (events.some((e) => e.type === "gambit")) hud.say(me, "gambit");
    if (shots.some((e) => e.result === "sunk")) {
      if (!events.some((e) => e.type === "gambit")) hud.say(me, "sink");
      hud.say(them, "hurt");
      hud.react(them, "hurt");
      hud.react(me, "cheer");
    } else if (shots.some((e) => e.result === "hit")) {
      if (!events.some((e) => e.type === "gambit")) hud.say(me, "hit");
      hud.say(them, "hurt");
      hud.react(them, "hurt");
    } else if (shots.length && !events.some((e) => e.type === "gambit")) {
      hud.say(me, "miss");
    }
    for (const e of events) {
      const line = logLine(by, e);
      if (line) o.sidebar?.pushLog(line);
    }
    refresh();
  }

  function refresh() {
    if (!ctrl) return;
    hud.fleet(ctrl.fleetReport());
    hud.gambit(ctrl.gambitStatus(), aim ? aimHint(aim) : null);
    o.sidebar?.update(sidebarModel(ctrl.state()));
    renderAim();
  }

  function aimHint(a: Aim): string {
    switch (a.kind) {
      case "broadside":
        return `Pick 3 squares in their waters (${a.picks.length}/3). Click a pick again to drop it.`;
      case "powderkeg":
        return "Choose the blast centre in their waters. Red squares aren't open water.";
      case "crowsnest":
        return "Choose a 3×3 area in their waters for the lookout to count.";
      case "ghostship":
        return a.ship
          ? `Choose a new berth for yer ${SHIP_NAMES[a.ship]} in your waters. R to rotate.`
          : "Click one of your ships still afloat to slip away.";
    }
  }

  function beginAim() {
    if (!ctrl) return;
    if (aim) return cancelAim();
    const st = ctrl.gambitStatus();
    if (!st || st.state !== "ready") {
      if (st?.reason) hud.banner(st.reason);
      return;
    }
    const kind = captainSpec(o.captains[0]).gambit;
    const next: Aim = kind === "broadside"
      ? { kind, picks: [] }
      : kind === "ghostship"
        ? { kind, ship: null, orientation: "H" }
        : { kind };
    aim = next;
    ctrl.hover(null);
    hud.banner(aimHint(next));
    refresh();
  }

  function cancelAim() {
    aim = null;
    scene.setPreview("enemy", []);
    scene.setPreview("player", []);
    scene.setGhost(null);
    if (ctrl && hover?.grid === "enemy") ctrl.hover(hover.cell);
    refresh();
  }

  function ownShipAt(cell: Coord) {
    const st = ctrl!.state();
    return st.players[0].fleet.find(
      (s) => !isSunk(s, st.rules) && shipCells(s, st.rules).some((c) => sameCoord(c, cell)),
    );
  }

  function ghostTarget(a: Extract<Aim, { kind: "ghostship" }>, cell: Coord): Placement | null {
    return a.ship ? anchoredPlacement(a.ship, cell, a.orientation) : null;
  }

  function renderAim() {
    if (!ctrl) return;
    if (!aim) {
      scene.setPreview("enemy", []);
      scene.setPreview("player", []);
      scene.setGhost(null);
      return;
    }
    const fired = ctrl.firedAt("enemy");
    const tiles: { cell: Coord; tone: Tone }[] = [];
    const onEnemy = hover?.grid === "enemy" ? hover.cell : null;
    const onOwn = hover?.grid === "player" ? hover.cell : null;
    if (aim.kind === "broadside") {
      for (const c of aim.picks) tiles.push({ cell: c, tone: "target" });
      if (onEnemy && !aim.picks.some((c) => sameCoord(c, onEnemy))) {
        tiles.push({ cell: onEnemy, tone: fired.has(coordKey(onEnemy)) ? "invalid" : "valid" });
      }
    } else if (aim.kind === "powderkeg" && onEnemy) {
      // the engine judges the whole blast; an illegal blast shows hatched red
      const ok = ctrl.checkGambit({ kind: "powderkeg", center: onEnemy }).ok;
      for (const c of blastCells(onEnemy)) tiles.push({ cell: c, tone: ok ? "valid" : "invalid" });
    } else if (aim.kind === "crowsnest" && onEnemy) {
      for (const c of scoutArea(onEnemy)) tiles.push({ cell: c, tone: "scout" });
    }
    scene.setPreview("enemy", tiles);

    if (aim.kind === "ghostship") {
      const a = aim;
      const own: { cell: Coord; tone: Tone }[] = [];
      if (!a.ship) {
        const s = onOwn ? ownShipAt(onOwn) : undefined;
        if (s) for (const c of shipCells(s)) own.push({ cell: c, tone: "target" });
        scene.setGhost(null);
      } else {
        const cur = ctrl.state().players[0].fleet.find((s) => s.id === a.ship)!;
        for (const c of shipCells(cur)) own.push({ cell: c, tone: "scout" });
        const to = onOwn ? ghostTarget(a, onOwn) : null;
        if (to) {
          const ok = ctrl.checkGambit({ kind: "ghostship", to }).ok;
          for (const c of shipCells(to)) own.push({ cell: c, tone: ok ? "valid" : "invalid" });
          scene.setGhost(to, ok);
        } else {
          scene.setGhost(null);
        }
      }
      scene.setPreview("player", own);
    }
  }

  function aimClick(a: Aim, cell: Coord, grid: Grid) {
    const c = ctrl!;
    const fail = (e: GambitError | "busy") => {
      scene.shakeReticle();
      hud.gambit(c.gambitStatus(), GAMBIT_WHY[e] ?? "Not there.");
    };
    if (a.kind === "ghostship") {
      if (grid !== "player") return;
      if (!a.ship) {
        const s = ownShipAt(cell);
        if (!s) return fail("ship_sunk");
        a.ship = s.id;
        a.orientation = s.orientation;
        hud.banner(aimHint(a));
        return refresh();
      }
      const to = ghostTarget(a, cell)!;
      const r = c.useGambit({ kind: "ghostship", to });
      if (!r.ok) {
        // clicking another of our ships switches which one slips away
        const other = ownShipAt(cell);
        if (other && other.id !== a.ship && r.error === "illegal_position") {
          a.ship = other.id;
          a.orientation = other.orientation;
          return refresh();
        }
        return fail(r.error);
      }
      aim = null;
      return refresh();
    }
    if (grid !== "enemy") return;
    if (a.kind === "broadside") {
      const i = a.picks.findIndex((p) => sameCoord(p, cell));
      if (i >= 0) {
        a.picks.splice(i, 1);
        return refresh();
      }
      if (c.firedAt("enemy").has(coordKey(cell))) return fail("invalid_targets");
      a.picks.push(cell);
      if (a.picks.length < 3) return refresh();
      const r = c.useGambit({ kind: "broadside", targets: a.picks });
      if (!r.ok) {
        a.picks.pop();
        return fail(r.error);
      }
      aim = null;
      return refresh();
    }
    const r = c.useGambit(a.kind === "powderkeg" ? { kind: "powderkeg", center: cell } : { kind: "crowsnest", center: cell });
    if (!r.ok) return fail(r.error);
    aim = null;
    refresh();
  }

  // ---------------- input routing ----------------
  scene.onHover((cell, grid) => {
    hover = cell && grid ? { cell, grid } : null;
    if (!ctrl) {
      pc.hover(grid === "player" ? cell : null);
      return renderPlacement();
    }
    if (aim) {
      ctrl.hover(null);
      return renderAim();
    }
    ctrl.hover(grid === "enemy" ? cell : null);
  });
  scene.onFire((cell, grid) => {
    if (!ctrl) return placementClick(cell, grid);
    if (aim) return aimClick(aim, cell, grid);
    if (grid === "enemy" && ctrl.fireAt(cell)) refresh();
  });

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!ctrl) {
      if (k === "r") {
        pc.rotate();
        placementBanner();
        renderPlacement();
      } else if (k === "escape") {
        pc.select(null);
        placementBanner();
        renderPlacement();
      } else if (k === "enter" && pc.complete()) {
        startBattle([pc.placed(), randomPlacement(rng)]);
      }
      return;
    }
    if (k === "escape" && aim) cancelAim();
    else if (k === "g" && o.gambit) beginAim();
    else if (k === "r" && aim?.kind === "ghostship" && aim.ship) {
      aim.orientation = aim.orientation === "H" ? "V" : "H";
      renderAim();
    }
  }
  window.addEventListener("keydown", onKey);

  // ---------------- boot ----------------
  if (o.fleets) {
    startBattle(o.fleets);
  } else {
    scene.focus("own");
    scene.setEnemyFog(true);
    placementBanner();
    // captains introduce themselves while you muster the fleet
    hud.say("own", "select");
    hud.say("enemy", "select");
    renderPlacement();
  }

  function placementDo(fn: () => void) {
    if (ctrl) return;
    fn();
    placementBanner();
    renderPlacement();
  }

  return {
    phase: () => (ctrl ? "battle" : "placement"),
    controller: () => ctrl,
    selectShip: (id) => placementDo(() => pc.select(pc.selected() === id ? null : id)),
    rotate: () => placementDo(() => pc.rotate()),
    randomize: () => placementDo(() => pc.randomize()),
    clear: () => placementDo(() => pc.clear()),
    start() {
      if (!ctrl && pc.complete()) startBattle([pc.placed(), randomPlacement(rng)]);
    },
    gambit: beginAim,
    autoPlace() {
      if (ctrl) return;
      pc.randomize();
      startBattle([pc.placed(), randomPlacement(rng)]);
    },
    debugPlace(id, cell, orientation) {
      if (ctrl) return;
      pc.select(id);
      if (orientation && pc.orientation() !== orientation) pc.rotate();
      pc.click(cell);
      placementBanner();
      renderPlacement();
    },
    debugHover(cell) {
      if (ctrl) return;
      pc.hover(cell);
      renderPlacement();
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
    },
  };
}
