import { inBounds, sameCoord } from "./coords";
import { shipCells, validateFleet, type PlacementError } from "./placement";
import { RULES, shipLength, type Rules, type ShipId } from "./rules";
import type {
  Coord,
  GameEvent,
  GameState,
  Placement,
  PlayerIndex,
  PlayerState,
  Result,
  ShipState,
  Shot,
  ShotResult,
} from "./types";

export type CreateError = PlacementError | "incomplete_fleet";
export type FireError =
  | "game_over"
  | "not_your_turn"
  | "out_of_bounds"
  | "already_fired";

function toPlayerState(fleet: readonly Placement[]): PlayerState {
  return {
    fleet: fleet.map((p) => ({ ...p, hits: 0 })),
    shots: [],
  };
}

export function createGame(opts: {
  fleets: readonly [readonly Placement[], readonly Placement[]];
  rules?: Rules;
  firstPlayer?: PlayerIndex;
}): Result<GameState, CreateError> {
  const rules = opts.rules ?? RULES;
  const firstPlayer = opts.firstPlayer ?? 0;
  const f0 = validateFleet(opts.fleets[0], rules);
  if (!f0.ok) {
    return { ok: false, error: f0.error };
  }
  const f1 = validateFleet(opts.fleets[1], rules);
  if (!f1.ok) {
    return { ok: false, error: f1.error };
  }
  return {
    ok: true,
    value: {
      rules,
      players: [toPlayerState(f0.value), toPlayerState(f1.value)],
      turn: firstPlayer,
      status: "playing",
      winner: null,
      seq: 0,
      firstPlayer,
    },
  };
}

/** Same rules, fresh state, firstPlayer alternates. */
export function rematch(
  prev: GameState,
  fleets: readonly [readonly Placement[], readonly Placement[]],
): Result<GameState, CreateError> {
  return createGame({
    fleets,
    rules: prev.rules,
    firstPlayer: prev.firstPlayer === 0 ? 1 : 0,
  });
}

export function shipAt(
  fleet: readonly ShipState[],
  coord: Coord,
  rules: Rules = RULES,
): ShipState | undefined {
  return fleet.find((s) =>
    shipCells(s, rules).some((c) => sameCoord(c, coord)),
  );
}

export function isSunk(ship: ShipState, rules: Rules = RULES): boolean {
  return ship.hits >= shipLength(ship.id, rules);
}

export function remainingShips(state: GameState, owner: PlayerIndex): ShipId[] {
  return state.players[owner].fleet
    .filter((s) => !isSunk(s, state.rules))
    .map((s) => s.id);
}

export function fire(
  state: GameState,
  player: PlayerIndex,
  coord: Coord,
): Result<{ state: GameState; events: GameEvent[] }, FireError> {
  if (state.status === "over") {
    return { ok: false, error: "game_over" };
  }
  if (player !== state.turn) {
    return { ok: false, error: "not_your_turn" };
  }
  if (!inBounds(coord, state.rules)) {
    return { ok: false, error: "out_of_bounds" };
  }
  const shooter = state.players[player];
  if (shooter.shots.some((s) => sameCoord(s.coord, coord))) {
    return { ok: false, error: "already_fired" };
  }

  const defenderIndex: PlayerIndex = player === 0 ? 1 : 0;
  const defender = state.players[defenderIndex];
  const target = shipAt(defender.fleet, coord, state.rules);

  let result: ShotResult = "miss";
  let hitShip: ShipId | undefined;
  let sunkShip: ShipId | undefined;
  let defenderFleet = defender.fleet;
  if (target) {
    const hits = target.hits + 1;
    hitShip = target.id;
    if (hits >= shipLength(target.id, state.rules)) {
      result = "sunk";
      sunkShip = target.id;
    } else {
      result = "hit";
    }
    defenderFleet = defender.fleet.map((s) =>
      s === target ? { ...s, hits } : s,
    );
  }

  const seq = state.seq + 1;
  const shot: Shot =
    hitShip === undefined ? { coord, result } : { coord, result, shipId: hitShip };
  const events: GameEvent[] = [
    hitShip === undefined
      ? { type: "shot", by: player, coord, result, seq }
      : { type: "shot", by: player, coord, result, shipId: hitShip, seq },
  ];
  if (sunkShip !== undefined) {
    events.push({ type: "sunk", by: player, shipId: sunkShip, seq });
  }

  const gameOver = defenderFleet.every((s) => isSunk(s, state.rules));
  if (gameOver) {
    events.push({ type: "gameOver", winner: player, seq });
  }

  const nextShooter: PlayerState = {
    fleet: shooter.fleet,
    shots: [...shooter.shots, shot],
  };
  const nextDefender: PlayerState = { fleet: defenderFleet, shots: defender.shots };
  const players: [PlayerState, PlayerState] =
    player === 0 ? [nextShooter, nextDefender] : [nextDefender, nextShooter];

  return {
    ok: true,
    value: {
      state: {
        ...state,
        players,
        turn: gameOver ? player : defenderIndex,
        status: gameOver ? "over" : "playing",
        winner: gameOver ? player : null,
        seq,
      },
      events,
    },
  };
}
