import { createGame, fire } from "../engine/game";
import { randomPlacement } from "../engine/placement";
import { mulberry32, type Rng } from "../engine/rng";
import type { Coord, GameState, PlayerIndex } from "../engine/types";
import { easyShot } from "./easy";
import { initialKnowledge, observe, type Knowledge } from "./knowledge";
import { mediumShot } from "./medium";

/**
 * The referee: the only file in src/ai allowed to hold a GameState.
 * The AI strategies themselves only ever see Knowledge built from
 * public GameEvents.
 */
export type Difficulty = "easy" | "medium";

export interface SimResult {
  winner: PlayerIndex;
  /** Shots fired per side: [player 0 shots, player 1 shots]. */
  shots: readonly [number, number];
  turns: number;
}

export function shotFor(d: Difficulty, k: Knowledge, rng: Rng): Coord {
  return d === "easy" ? easyShot(k, rng) : mediumShot(k, rng);
}

const SHOT_CAP = 200; // safety: a side can never legally need more than 100

/**
 * Play one classic game between two AIs. Fleets come from one seeded
 * RNG; each AI gets its own derived RNG so per-AI randomness is
 * reproducible. Throws if the engine ever rejects a shot — the AIs are
 * never allowed to produce an illegal move.
 */
export function playClassicGame(opts: {
  seed: number;
  difficulty: readonly [Difficulty, Difficulty];
  firstPlayer?: PlayerIndex;
}): SimResult {
  const fleetRng = mulberry32(opts.seed);
  const fleets: [ReturnType<typeof randomPlacement>, ReturnType<typeof randomPlacement>] = [
    randomPlacement(fleetRng),
    randomPlacement(fleetRng),
  ];
  const created = createGame({
    fleets,
    firstPlayer: opts.firstPlayer ?? 0,
  });
  if (!created.ok) {
    throw new Error(`createGame failed: ${created.error}`);
  }
  let state: GameState = created.value;
  const rngs: [Rng, Rng] = [
    mulberry32(opts.seed ^ 0x9e3779b9),
    mulberry32(opts.seed ^ 0x51f15eed),
  ];
  const kb: [Knowledge, Knowledge] = [
    initialKnowledge(state.rules, 0),
    initialKnowledge(state.rules, 1),
  ];
  let turns = 0;
  while (state.status === "playing") {
    const p = state.turn;
    const fired = state.players[p].shots.length;
    if (fired >= SHOT_CAP) {
      throw new Error(`player ${p} exceeded ${SHOT_CAP} shots without winning`);
    }
    const coord = shotFor(opts.difficulty[p], kb[p], rngs[p]);
    const r = fire(state, p, coord);
    if (!r.ok) {
      throw new Error(`AI produced illegal shot: ${r.error}`);
    }
    state = r.value.state;
    turns++;
    kb[0] = observe(kb[0], r.value.events);
    kb[1] = observe(kb[1], r.value.events);
  }
  const winner = state.winner;
  if (winner === null) {
    throw new Error("game over without a winner");
  }
  const p0 = state.players[0].shots.length;
  const p1 = state.players[1].shots.length;
  return { winner, shots: [p0, p1], turns };
}
