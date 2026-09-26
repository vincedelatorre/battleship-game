import { captainSpec, type CaptainId, type GambitKind } from "./captains";
import { coordKey, inBounds, orthogonalNeighbors } from "./coords";
import { isSunk, resolveShot } from "./game";
import { shipCells } from "./placement";
import { RULES, type Rules, type ShipId } from "./rules";
import type {
  Coord,
  GambitState,
  GameEvent,
  GameState,
  Placement,
  PlayerIndex,
  PlayerState,
  Result,
  ShipState,
} from "./types";

export type GambitParams =
  /** must be exactly 3 */
  | { kind: "broadside"; targets: readonly Coord[] }
  | { kind: "powderkeg"; center: Coord }
  | { kind: "crowsnest"; center: Coord }
  /** to.id selects which of the player's own ships moves */
  | { kind: "ghostship"; to: Placement };

export type GambitError =
  | "gambit_disabled"
  | "game_over"
  | "not_your_turn"
  | "already_used"
  | "wrong_gambit"
  | "invalid_targets"
  | "out_of_bounds"
  | "not_open_water"
  | "unknown_ship"
  | "ship_sunk"
  | "illegal_position"
  | "fired_cell"
  | "same_position";

const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);

/** Plus-shaped blast: center, up, down, left, right — clipped at the board edge. */
export function blastCells(center: Coord, rules: Rules = RULES): Coord[] {
  const cells: Coord[] = [
    center,
    { row: center.row - 1, col: center.col },
    { row: center.row + 1, col: center.col },
    { row: center.row, col: center.col - 1 },
    { row: center.row, col: center.col + 1 },
  ];
  return cells.filter((c) => inBounds(c, rules));
}

/** 3x3 centred on `center`, clipped at the board edge. */
export function scoutArea(center: Coord, rules: Rules = RULES): Coord[] {
  const cells: Coord[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const c = { row: center.row + dr, col: center.col + dc };
      if (inBounds(c, rules)) {
        cells.push(c);
      }
    }
  }
  return cells;
}

/**
 * The blast is legal only on open water: no blast cell may be already fired,
 * and no blast cell may touch (orthogonally) a known hit on a ship not yet
 * sunk — so it can never finish a ship the player already found. Known hits
 * against a relocated ship still count (deliberately conservative).
 */
export function powderKegLegal(
  state: GameState,
  player: PlayerIndex,
  center: Coord,
): Result<Coord[], "out_of_bounds" | "not_open_water"> {
  if (!inBounds(center, state.rules)) {
    return { ok: false, error: "out_of_bounds" };
  }
  const cells = blastCells(center, state.rules);
  const shots = state.players[player].shots;
  const fired = new Set(shots.map((s) => coordKey(s.coord)));
  if (cells.some((c) => fired.has(coordKey(c)))) {
    return { ok: false, error: "not_open_water" };
  }
  const sunkIds = new Set<ShipId>();
  for (const s of shots) {
    if (s.result === "sunk" && s.shipId !== undefined) {
      sunkIds.add(s.shipId);
    }
  }
  const knownHits = new Set(
    shots
      .filter(
        (s) =>
          (s.result === "hit" || s.result === "sunk") &&
          s.shipId !== undefined &&
          !sunkIds.has(s.shipId),
      )
      .map((s) => coordKey(s.coord)),
  );
  const touchesHit = cells.some((c) =>
    orthogonalNeighbors(c, state.rules).some((n) => knownHits.has(coordKey(n))),
  );
  if (touchesHit) {
    return { ok: false, error: "not_open_water" };
  }
  return { ok: true, value: cells };
}

function announce(
  by: PlayerIndex,
  captain: CaptainId,
  gambit: GambitKind,
  seq: number,
): GameEvent {
  return { type: "gambit", by, captain, gambit, seq };
}

function beginGambit(
  state: GameState,
  gs: GambitState,
  player: PlayerIndex,
  seq: number,
): GameState {
  const used: [boolean, boolean] =
    player === 0 ? [true, gs.used[1]] : [gs.used[0], true];
  return { ...state, gambit: { captains: gs.captains, used }, seq };
}

/** Fire cells in order through resolveShot; stop immediately if the game ends. */
function fireCells(
  state: GameState,
  player: PlayerIndex,
  cells: readonly Coord[],
  seq: number,
  events: GameEvent[],
): GameState {
  let s = state;
  for (const c of cells) {
    const r = resolveShot(s, player, c, seq);
    s = r.state;
    events.push(...r.events);
    if (s.status === "over") {
      break;
    }
  }
  return s;
}

export function useGambit(
  state: GameState,
  player: PlayerIndex,
  params: GambitParams,
): Result<{ state: GameState; events: GameEvent[] }, GambitError> {
  const gs = state.gambit;
  if (!gs) {
    return { ok: false, error: "gambit_disabled" };
  }
  if (state.status === "over") {
    return { ok: false, error: "game_over" };
  }
  if (player !== state.turn) {
    return { ok: false, error: "not_your_turn" };
  }
  if (gs.used[player]) {
    return { ok: false, error: "already_used" };
  }
  const captain = gs.captains[player];
  if (captainSpec(captain).gambit !== params.kind) {
    return { ok: false, error: "wrong_gambit" };
  }
  const seq = state.seq + 1;

  if (params.kind === "broadside") {
    const targets = params.targets;
    const fired = new Set(
      state.players[player].shots.map((s) => coordKey(s.coord)),
    );
    const valid =
      targets.length === 3 &&
      new Set(targets.map(coordKey)).size === targets.length &&
      targets.every((c) => inBounds(c, state.rules) && !fired.has(coordKey(c)));
    if (!valid) {
      return { ok: false, error: "invalid_targets" };
    }
    let s = beginGambit(state, gs, player, seq);
    const events: GameEvent[] = [announce(player, captain, "broadside", seq)];
    s = fireCells(s, player, targets, seq, events);
    if (s.status !== "over") {
      s = { ...s, turn: other(player) };
    }
    return { ok: true, value: { state: s, events } };
  }

  if (params.kind === "powderkeg") {
    const legal = powderKegLegal(state, player, params.center);
    if (!legal.ok) {
      return legal;
    }
    let s = beginGambit(state, gs, player, seq);
    const events: GameEvent[] = [announce(player, captain, "powderkeg", seq)];
    s = fireCells(s, player, legal.value, seq, events);
    if (s.status !== "over") {
      s = { ...s, turn: other(player) };
    }
    return { ok: true, value: { state: s, events } };
  }

  if (params.kind === "crowsnest") {
    if (!inBounds(params.center, state.rules)) {
      return { ok: false, error: "out_of_bounds" };
    }
    const s = beginGambit(state, gs, player, seq);
    const area = new Set(scoutArea(params.center, state.rules).map(coordKey));
    let count = 0;
    for (const ship of s.players[other(player)].fleet) {
      for (const c of shipCells(ship, state.rules)) {
        if (area.has(coordKey(c))) {
          count++;
        }
      }
    }
    // Free action: the turn is untouched; the player still calls fire().
    const events: GameEvent[] = [
      announce(player, captain, "crowsnest", seq),
      { type: "scout", by: player, center: params.center, count, seq },
    ];
    return { ok: true, value: { state: s, events } };
  }

  // ghostship
  const to = params.to;
  const me = state.players[player];
  const ship = me.fleet.find((sh) => sh.id === to.id);
  if (!ship) {
    return { ok: false, error: "unknown_ship" };
  }
  if (isSunk(ship, state.rules)) {
    return { ok: false, error: "ship_sunk" };
  }
  if (
    ship.row === to.row &&
    ship.col === to.col &&
    ship.orientation === to.orientation
  ) {
    return { ok: false, error: "same_position" };
  }
  const cells = shipCells(to, state.rules);
  if (!cells.every((c) => inBounds(c, state.rules))) {
    return { ok: false, error: "illegal_position" };
  }
  const ownCells = new Set(
    me.fleet
      .filter((sh) => sh !== ship)
      .flatMap((sh) => shipCells(sh, state.rules).map(coordKey)),
  );
  if (cells.some((c) => ownCells.has(coordKey(c)))) {
    return { ok: false, error: "illegal_position" };
  }
  const firedAt = new Set(
    state.players[other(player)].shots.map((s) => coordKey(s.coord)),
  );
  if (cells.some((c) => firedAt.has(coordKey(c)))) {
    return { ok: false, error: "fired_cell" };
  }
  let s = beginGambit(state, gs, player, seq);
  const movedFleet: ShipState[] = me.fleet.map((sh) =>
    sh === ship ? { ...to, hits: sh.hits } : sh,
  );
  const nextMe: PlayerState = { fleet: movedFleet, shots: me.shots };
  s = {
    ...s,
    players: player === 0 ? [nextMe, s.players[1]] : [s.players[0], nextMe],
    turn: other(player),
  };
  const events: GameEvent[] = [
    announce(player, captain, "ghostship", seq),
    { type: "relocated", by: player, shipId: to.id, seq },
  ];
  return { ok: true, value: { state: s, events } };
}
