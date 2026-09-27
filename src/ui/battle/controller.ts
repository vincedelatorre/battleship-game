import {
  coordLabel,
  createGame,
  fire,
  mulberry32,
  randomPlacement,
  type Coord,
  type GameEvent,
  type GameState,
  type Placement,
  type PlayerIndex,
  type Rng,
  type ShipId,
  type ShotResult,
} from "../../engine/index";
import { initialKnowledge, observe, type Knowledge } from "../../ai/knowledge";
import { mediumShot } from "../../ai/medium";

/** The scene/DOM surface the controller drives. No three.js here. */
export interface BattleView {
  setReticle(cell: Coord | null): void;
  shakeReticle(): void;
  /** side = whose water was hit: 'enemy' = our shot landed on their grid. */
  applyShot(side: "enemy" | "player", shot: {
    coord: Coord;
    result: ShotResult;
    shipId?: ShipId;
  }): void;
  revealShip(p: Placement): void;
  setOwnFleet(placements: readonly Placement[]): void;
  banner(text: string): void;
  gameOver(winner: PlayerIndex): void;
}

export interface BattleDeps {
  view: BattleView;
  rng?: Rng;
  /** Schedules the AI reply; tests inject a synchronous runner. */
  schedule?: (cb: () => void, ms: number) => void;
  /** Debug/test accessor: expose the enemy fleet (kept out of normal use). */
  debug?: boolean;
  /** Debug/test only: fixed fleets instead of random placement. */
  fleets?: readonly [readonly Placement[], readonly Placement[]];
}

const HUMAN: PlayerIndex = 0;
const AI: PlayerIndex = 1;

const SHIP_NAMES: Record<ShipId, string> = {
  carrier: "Man-o'-War",
  battleship: "Galleon",
  cruiser: "Frigate",
  submarine: "Brigantine",
  destroyer: "Sloop",
};

export function pirateLine(side: "enemy" | "player", label: string, r: {
  result: ShotResult;
  shipId?: ShipId;
}): string {
  const name = r.shipId !== undefined ? SHIP_NAMES[r.shipId] : "";
  if (side === "enemy") {
    if (r.result === "miss") return `${label} — Splash! Nothing but brine.`;
    if (r.result === "hit") return `${label} — Direct hit! Their ${name} takes a ball!`;
    return `${label} — Ye sank their ${name}!`;
  }
  if (r.result === "miss") return `They fire ${label} — a miss! Salt spray only.`;
  if (r.result === "hit") return `They fire ${label} — our ${name} is holed!`;
  return `They fire ${label} — our ${name} is lost! Down to the deep.`;
}

export interface BattleController {
  /** Player clicks a cell on Enemy Waters. */
  fireAt(coord: Coord): boolean;
  hover(cell: Coord | null): void;
  state(): GameState;
  /** debug only — never wire to the normal scene. */
  enemyFleet(): readonly Placement[];
}

export function createBattleController(deps: BattleDeps): BattleController {
  const rng = deps.rng ?? mulberry32(Date.now() >>> 0);
  const schedule = deps.schedule ?? ((cb: () => void, ms: number) => window.setTimeout(cb, ms));

  const [ownFleet, enemyFleet] = deps.fleets ?? [randomPlacement(rng), randomPlacement(rng)];
  const created = createGame({ fleets: [ownFleet, enemyFleet] });
  if (!created.ok) throw new Error(`createGame failed: ${created.error}`);
  let state = created.value;
  let knowledge: Knowledge = initialKnowledge(state.rules, AI);
  let aiBusy = false;

  deps.view.setOwnFleet(ownFleet);
  deps.view.banner("Your broadside, captain — pick a square in their waters.");

  function applyEvents(side: "enemy" | "player", events: readonly GameEvent[]) {
    for (const e of events) {
      if (e.type === "shot") {
        deps.view.applyShot(side, {
          coord: e.coord,
          result: e.result,
          ...(e.shipId !== undefined ? { shipId: e.shipId } : {}),
        });
        deps.view.banner(
          pirateLine(side, coordLabel(e.coord), { result: e.result, shipId: e.shipId }),
        );
      } else if (e.type === "sunk") {
        // sunk event follows the shot; the placement lives in the defender's fleet
        const defender: PlayerIndex = side === "enemy" ? AI : HUMAN;
        const ship = state.players[defender].fleet.find((s) => s.id === e.shipId);
        if (ship && defender === AI) deps.view.revealShip(ship);
      } else if (e.type === "gameOver") {
        deps.view.gameOver(e.winner);
      }
    }
  }

  function aiReply() {
    aiBusy = false;
    if (state.status !== "playing" || state.turn !== AI) return;
    const coord = mediumShot(knowledge, rng);
    const r = fire(state, AI, coord);
    if (!r.ok) return;
    state = r.value.state;
    knowledge = observe(knowledge, r.value.events);
    applyEvents("player", r.value.events);
  }

  return {
    fireAt(coord) {
      if (state.status !== "playing" || state.turn !== HUMAN || aiBusy) {
        deps.view.shakeReticle();
        return false;
      }
      const r = fire(state, HUMAN, coord);
      if (!r.ok) {
        deps.view.shakeReticle();
        return false;
      }
      state = r.value.state;
      applyEvents("enemy", r.value.events);
      if (state.status === "playing") {
        aiBusy = true;
        schedule(aiReply, 700);
      }
      return true;
    },
    hover(cell) {
      if (state.status !== "playing" || state.turn !== HUMAN || aiBusy) {
        deps.view.setReticle(null);
        return;
      }
      deps.view.setReticle(cell);
    },
    state() {
      return state;
    },
    enemyFleet() {
      if (!deps.debug) return [];
      return enemyFleet;
    },
  };
}

