import { CAPTAINS, type CaptainId } from "../engine/captains";
import { randInt, type Rng } from "../engine/rng";

/**
 * Pick a captain uniformly at random, excluding `avoid` when given.
 * Used for the AI's captain in both modes — in Standard mode it is
 * purely cosmetic.
 */
export function pickCaptain(rng: Rng, avoid?: CaptainId): CaptainId {
  const pool = CAPTAINS.filter((c) => c.id !== avoid);
  const pick = pool[randInt(rng, pool.length)];
  if (!pick) {
    throw new Error("pickCaptain: no captains available");
  }
  return pick.id;
}
