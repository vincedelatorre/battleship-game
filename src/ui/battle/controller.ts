import {
  captainSpec,
  coordKey,
  coordLabel,
  createGame,
  fire,
  inBounds,
  isSunk,
  mulberry32,
  powderKegLegal,
  randomPlacement,
  RULES,
  sameCoord,
  shipCells,
  shipLength,
  useGambit,
  type CaptainId,
  type Coord,
  type GambitError,
  type GambitKind,
  type GambitParams,
  type GameEvent,
  type GameState,
  type Placement,
  type PlayerIndex,
  type Result,
  type Rng,
  type ShipId,
  type ShotResult,
} from "../../engine/index";
import { aiAction } from "../../ai/gambitAi";
import { initialKnowledge, observe, type Knowledge } from "../../ai/knowledge";
import type { Difficulty } from "../../ai/shot";
import { captainProfile } from "../captains";

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
  /** Gambit extras — optional so a Standard-mode view stays minimal. */
  scout?(center: Coord, count: number, by: PlayerIndex): void;
  moveOwnShip?(from: Placement, to: Placement): void;
  enemyRelocated?(shipId: ShipId): void;
  /** Every accepted engine action, after the view has been updated. */
  events?(by: PlayerIndex, events: readonly GameEvent[]): void;
}

export interface BattleDeps {
  view: BattleView;
  rng?: Rng;
  /** Schedules the AI reply; tests inject a synchronous runner. */
  schedule?: (cb: () => void, ms: number) => void;
  /** Debug/test accessor: expose the enemy fleet (kept out of normal use). */
  debug?: boolean;
  /** Fixed fleets (the player's from the placement screen) instead of random. */
  fleets?: readonly [readonly Placement[], readonly Placement[]];
  difficulty?: Difficulty;
  /** [human, AI]. Cosmetic in Standard mode; required for Gambit mode. */
  captains?: readonly [CaptainId, CaptainId];
  /** Gambit mode (rules.gambit). Needs `captains`. */
  gambit?: boolean;
  /** called after each applyEvents — side, events, and fresh state; the
   *  sidebar log feeds on this */
  onEvents?(
    by: PlayerIndex,
    events: readonly GameEvent[],
    state: GameState,
  ): void;
}

const HUMAN: PlayerIndex = 0;
const AI: PlayerIndex = 1;
const AI_DELAY = 700;

export const SHIP_NAMES: Record<ShipId, string> = {
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

function shortResult(label: string, r: { result: ShotResult; shipId?: ShipId }): string {
  const name = r.shipId !== undefined ? SHIP_NAMES[r.shipId] : "";
  if (r.result === "miss") return `${label} miss`;
  return r.result === "hit" ? `${label} hit (${name})` : `${label} SUNK ${name}`;
}

export type GambitStatus = {
  readonly kind: GambitKind;
  readonly name: string;
  readonly state: "ready" | "unavailable" | "spent";
  readonly reason?: string;
};

export interface ShipReport {
  readonly id: ShipId;
  readonly length: number;
  /** Per-square damage, bow to stern. Enemy: count only, so filled from the bow. */
  readonly segments: readonly boolean[];
  readonly hits: number;
  readonly sunk: boolean;
  /** True when `segments` shows the exact squares that were hit. */
  readonly exact: boolean;
}

export interface BattleController {
  /** Player clicks a cell on Enemy Waters. */
  fireAt(coord: Coord): boolean;
  hover(cell: Coord | null): void;
  state(): GameState;
  /** True while input is locked (AI turn or game over). */
  busy(): boolean;
  /** null in Standard mode. */
  gambitStatus(): GambitStatus | null;
  /** Dry run: would this Gambit be legal right now? Never mutates. */
  checkGambit(params: GambitParams): Result<true, GambitError | "busy">;
  useGambit(params: GambitParams): Result<true, GambitError | "busy">;
  /** Squares of `side`'s grid that have already been fired at. */
  firedAt(side: "enemy" | "player"): ReadonlySet<string>;
  fleetReport(): { own: ShipReport[]; enemy: ShipReport[] };
  /** debug only — never wire to the normal scene. */
  enemyFleet(): readonly Placement[];
}

export function createBattleController(deps: BattleDeps): BattleController {
  const rng = deps.rng ?? mulberry32(Date.now() >>> 0);
  const schedule = deps.schedule ?? ((cb: () => void, ms: number) => window.setTimeout(cb, ms));
  const difficulty: Difficulty = deps.difficulty ?? "medium";
  const gambitOn = !!deps.gambit && !!deps.captains;
  const rules = gambitOn ? { ...RULES, gambit: true } : RULES;

  const [ownFleet, enemyFleet] = deps.fleets ?? [randomPlacement(rng), randomPlacement(rng)];
  const created = createGame({
    fleets: [ownFleet, enemyFleet],
    rules,
    ...(gambitOn ? { captains: deps.captains } : {}),
  });
  if (!created.ok) throw new Error(`createGame failed: ${created.error}`);
  let state = created.value;
  let knowledge: Knowledge = initialKnowledge(state.rules, AI);
  let aiBusy = false;
  /** What the player publicly knows of enemy damage: named hits, minus Ghost Ship repairs. */
  const enemyHits = new Map<ShipId, number>();
  const enemySunk = new Set<ShipId>();

  deps.view.setOwnFleet(ownFleet);
  deps.view.banner("Your broadside, captain — pick a square in their waters.");

  const captainName = (p: PlayerIndex) =>
    deps.captains ? captainProfile(deps.captains[p]).short : p === HUMAN ? "Ye" : "The enemy";

  function applyEvents(by: PlayerIndex, prev: GameState, events: readonly GameEvent[]) {
    const side: "enemy" | "player" = by === HUMAN ? "enemy" : "player";
    const gambitEv = events.find((e) => e.type === "gambit");
    const parts: string[] = [];
    for (const e of events) {
      if (e.type === "shot") {
        deps.view.applyShot(side, {
          coord: e.coord,
          result: e.result,
          ...(e.shipId !== undefined ? { shipId: e.shipId } : {}),
        });
        if (by === HUMAN && e.shipId !== undefined) {
          enemyHits.set(e.shipId, (enemyHits.get(e.shipId) ?? 0) + 1);
        }
        const r = { result: e.result, shipId: e.shipId };
        parts.push(shortResult(coordLabel(e.coord), r));
        if (!gambitEv) deps.view.banner(pirateLine(side, coordLabel(e.coord), r));
      } else if (e.type === "sunk") {
        // sunk event follows the shot; the placement lives in the defender's fleet
        if (by === HUMAN) {
          enemySunk.add(e.shipId);
          const ship = state.players[AI].fleet.find((s) => s.id === e.shipId);
          if (ship) deps.view.revealShip(ship);
        }
      } else if (e.type === "scout") {
        deps.view.scout?.(e.center, e.count, by);
        const sq = e.count === 1 ? "square" : "squares";
        parts.push(
          by === HUMAN
            ? `the lookout counts ${e.count} ship ${sq} around ${coordLabel(e.center)}. Now fire!`
            : `their lookout scans our waters around ${coordLabel(e.center)}.`,
        );
      } else if (e.type === "relocated") {
        if (by === HUMAN) {
          const from = prev.players[HUMAN].fleet.find((s) => s.id === e.shipId);
          const to = state.players[HUMAN].fleet.find((s) => s.id === e.shipId);
          if (from && to) deps.view.moveOwnShip?.(from, to);
          parts.push(`our ${SHIP_NAMES[e.shipId]} slips away through the fog, one hole patched!`);
        } else {
          enemyHits.set(e.shipId, Math.max(0, (enemyHits.get(e.shipId) ?? 0) - 1));
          deps.view.enemyRelocated?.(e.shipId);
          parts.push(`their ${SHIP_NAMES[e.shipId]} slipped away into the fog!`);
        }
      } else if (e.type === "gameOver") {
        deps.view.gameOver(e.winner);
      }
    }
    if (gambitEv && gambitEv.type === "gambit") {
      const name = captainProfile(gambitEv.captain).gambit.name;
      const detail = parts.join(" · ");
      deps.view.banner(
        `${captainName(by)} invokes ${name}! ${detail.charAt(0).toUpperCase()}${detail.slice(1)}`.trim(),
      );
    }
    deps.view.events?.(by, events);
    deps.onEvents?.(by, events, state);
  }

  function commit(by: PlayerIndex, r: { state: GameState; events: GameEvent[] }) {
    const prev = state;
    state = r.state;
    knowledge = observe(knowledge, r.events);
    applyEvents(by, prev, r.events);
  }

  function queueAi() {
    if (state.status === "playing" && state.turn === AI) {
      aiBusy = true;
      schedule(aiReply, AI_DELAY);
    }
  }

  function aiReply() {
    aiBusy = false;
    if (state.status !== "playing" || state.turn !== AI) return;
    const gs = state.gambit;
    const action = aiAction(
      knowledge,
      { fleet: state.players[AI].fleet, incoming: state.players[HUMAN].shots },
      gs ? { captain: gs.captains[AI], used: gs.used[AI] } : null,
      difficulty,
      rng,
    );
    const r = action.type === "gambit"
      ? useGambit(state, AI, action.params)
      : fire(state, AI, action.coord);
    if (!r.ok) return;
    commit(AI, r.value);
    queueAi(); // Crow's Nest is a free action: the AI still has its shot
  }

  function locked(): boolean {
    return state.status !== "playing" || state.turn !== HUMAN || aiBusy;
  }

  const gambitCache = { seq: -1, busy: false, value: null as GambitStatus | null };
  function computeGambit(): GambitStatus | null {
    const gs = state.gambit;
    if (!gs) return null;
    const kind = captainSpec(gs.captains[HUMAN]).gambit;
    const name = captainProfile(gs.captains[HUMAN]).gambit.name;
    const out = (s: GambitStatus["state"], reason?: string): GambitStatus =>
      reason ? { kind, name, state: s, reason } : { kind, name, state: s };
    if (gs.used[HUMAN]) return out("spent", "Already used this battle");
    if (state.status !== "playing") return out("unavailable", "The battle is over");
    if (locked()) return out("unavailable", "Wait for your turn");
    const fired = state.players[HUMAN].shots.length;
    const cells = state.rules.rows * state.rules.cols;
    if (kind === "broadside" && cells - fired < 3) return out("unavailable", "Fewer than 3 open squares left");
    if (kind === "powderkeg" && !anyCell((c) => powderKegLegal(state, HUMAN, c).ok)) {
      return out("unavailable", "Only in open water — none left");
    }
    if (kind === "ghostship" && !ghostBerthExists()) return out("unavailable", "No safe berth for any ship");
    return out("ready");
  }

  function anyCell(ok: (c: Coord) => boolean): boolean {
    for (let row = 0; row < state.rules.rows; row++) {
      for (let col = 0; col < state.rules.cols; col++) {
        if (ok({ row, col })) return true;
      }
    }
    return false;
  }

  function ghostBerthExists(): boolean {
    return state.players[HUMAN].fleet.some(
      (ship) =>
        !isSunk(ship, state.rules) &&
        (["H", "V"] as const).some((orientation) =>
          anyCell((c) => useGambit(state, HUMAN, {
            kind: "ghostship",
            to: { id: ship.id, row: c.row, col: c.col, orientation },
          }).ok),
        ),
    );
  }

  function report(side: PlayerIndex): ShipReport[] {
    return state.players[side].fleet.map((ship) => {
      const length = shipLength(ship.id, state.rules);
      if (side === HUMAN) {
        const incoming = state.players[AI].shots;
        const cells = shipCells(ship, state.rules);
        const segs = cells.map((c) =>
          incoming.some((s) => s.result !== "miss" && sameCoord(s.coord, c)),
        );
        // damage carried over a Ghost Ship move isn't tied to squares
        let carried = ship.hits - segs.filter(Boolean).length;
        const segments = segs.map((h) => (h ? true : carried-- > 0));
        return { id: ship.id, length, segments, hits: ship.hits, sunk: isSunk(ship, state.rules), exact: true };
      }
      const sunk = enemySunk.has(ship.id);
      const hits = sunk ? length : Math.min(length, enemyHits.get(ship.id) ?? 0);
      return {
        id: ship.id,
        length,
        segments: Array.from({ length }, (_, i) => i < hits),
        hits,
        sunk,
        exact: sunk,
      };
    });
  }

  function tryGambit(params: GambitParams, apply: boolean): Result<true, GambitError | "busy"> {
    if (locked()) return { ok: false, error: "busy" };
    const r = useGambit(state, HUMAN, params);
    if (!r.ok) return r;
    if (apply) {
      commit(HUMAN, r.value);
      queueAi();
    }
    return { ok: true, value: true };
  }

  return {
    fireAt(coord) {
      if (locked() || !inBounds(coord, state.rules)) {
        deps.view.shakeReticle();
        return false;
      }
      const r = fire(state, HUMAN, coord);
      if (!r.ok) {
        deps.view.shakeReticle();
        return false;
      }
      commit(HUMAN, r.value);
      queueAi();
      return true;
    },
    hover(cell) {
      deps.view.setReticle(locked() ? null : cell);
    },
    state: () => state,
    busy: locked,
    gambitStatus() {
      const busy = locked();
      if (gambitCache.seq !== state.seq || gambitCache.busy !== busy) {
        gambitCache.seq = state.seq;
        gambitCache.busy = busy;
        gambitCache.value = computeGambit();
      }
      return gambitCache.value;
    },
    checkGambit: (p) => tryGambit(p, false),
    useGambit: (p) => tryGambit(p, true),
    firedAt(side) {
      const shooter = side === "enemy" ? HUMAN : AI;
      return new Set(state.players[shooter].shots.map((s) => coordKey(s.coord)));
    },
    fleetReport: () => ({ own: report(HUMAN), enemy: report(AI) }),
    enemyFleet() {
      if (!deps.debug) return [];
      return enemyFleet;
    },
  };
}
