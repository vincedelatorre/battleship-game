import type { CaptainId } from "../engine/captains";
import { createGame, fire } from "../engine/game";
import { useGambit } from "../engine/gambit";
import { randomPlacement } from "../engine/placement";
import { mulberry32, type Rng } from "../engine/rng";
import { RULES } from "../engine/rules";
import type { GameState, PlayerIndex } from "../engine/types";
import { aiAction, type SelfView } from "./gambitAi";
import { initialKnowledge, observe, type Knowledge } from "./knowledge";
import { shotFor, type Difficulty } from "./shot";

/**
 * The referee: the only file in src/ai allowed to hold a GameState.
 * The AI strategies themselves only ever see Knowledge built from
 * public GameEvents, plus their own SelfView (own fleet + shots
 * received).
 */
export type { Difficulty };
export { shotFor };

export interface SimResult {
  winner: PlayerIndex;
  /** Shots fired per side: [player 0 shots, player 1 shots]. */
  shots: readonly [number, number];
  turns: number;
  /** Whether each side used its Gambit (false for classic games). */
  gambitUsed: readonly [boolean, boolean];
}

const SHOT_CAP = 200; // safety: a side can never legally need more than 100

/**
 * Play one game between two AIs. With `captains` given the game runs
 * with rules.gambit = true; without them it's classic. Fleets come from
 * one seeded RNG; each AI gets its own derived RNG so per-AI randomness
 * is reproducible. Throws if the engine ever rejects an AI action.
 */
export function playGame(opts: {
  seed: number;
  difficulty: readonly [Difficulty, Difficulty];
  firstPlayer?: PlayerIndex;
  captains?: readonly [CaptainId, CaptainId];
}): SimResult {
  const rules = opts.captains ? { ...RULES, gambit: true } : RULES;
  const fleetRng = mulberry32(opts.seed);
  const fleets: [
    ReturnType<typeof randomPlacement>,
    ReturnType<typeof randomPlacement>,
  ] = [randomPlacement(fleetRng), randomPlacement(fleetRng)];
  const created = createGame({
    fleets,
    rules,
    firstPlayer: opts.firstPlayer ?? 0,
    captains: opts.captains,
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
    const opp: PlayerIndex = p === 0 ? 1 : 0;
    if (state.players[p].shots.length >= SHOT_CAP) {
      throw new Error(`player ${p} exceeded ${SHOT_CAP} shots without winning`);
    }
    const gs = state.gambit;
    const gambit = gs
      ? { captain: gs.captains[p], used: gs.used[p] }
      : null;
    const self: SelfView = {
      fleet: state.players[p].fleet,
      incoming: state.players[opp].shots,
    };
    const action = aiAction(kb[p], self, gambit, opts.difficulty[p], rngs[p]);
    const r =
      action.type === "gambit"
        ? useGambit(state, p, action.params)
        : fire(state, p, action.coord);
    if (!r.ok) {
      throw new Error(`AI produced illegal action: ${r.error}`);
    }
    state = r.value.state;
    turns++;
    // One engine action's events per observe() call.
    kb[0] = observe(kb[0], r.value.events);
    kb[1] = observe(kb[1], r.value.events);
  }
  const winner = state.winner;
  if (winner === null) {
    throw new Error("game over without a winner");
  }
  const used = state.gambit?.used ?? [false, false];
  const p0 = state.players[0].shots.length;
  const p1 = state.players[1].shots.length;
  return {
    winner,
    shots: [p0, p1],
    turns,
    gambitUsed: [used[0] ?? false, used[1] ?? false],
  };
}

/** Classic (non-Gambit) games only — kept for the step-6.2 call sites. */
export function playClassicGame(opts: {
  seed: number;
  difficulty: readonly [Difficulty, Difficulty];
  firstPlayer?: PlayerIndex;
}): SimResult {
  return playGame(opts);
}
