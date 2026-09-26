import { randInt, type Rng } from "../engine/rng";
import type { Coord } from "../engine/types";
import { untried } from "./common";
import type { Knowledge } from "./knowledge";

/** Easy AI: fires at a uniformly random untried cell. */
export function easyShot(k: Knowledge, rng: Rng): Coord {
  const pool = untried(k);
  const pick = pool[randInt(rng, pool.length)];
  if (!pick) {
    // Unreachable in a live game: the game is over before every cell is fired.
    throw new Error("easyShot: no untried cells remain");
  }
  return pick;
}
