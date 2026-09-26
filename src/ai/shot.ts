import type { Rng } from "../engine/rng";
import type { Coord } from "../engine/types";
import { easyShot } from "./easy";
import { mediumShot } from "./medium";
import type { Knowledge } from "./knowledge";

export type Difficulty = "easy" | "medium";

/** Pick the next normal shot for a difficulty. */
export function shotFor(d: Difficulty, k: Knowledge, rng: Rng): Coord {
  return d === "easy" ? easyShot(k, rng) : mediumShot(k, rng);
}
