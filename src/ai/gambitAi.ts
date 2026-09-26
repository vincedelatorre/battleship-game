import { captainSpec, type CaptainId } from "../engine/captains";
import { coordKey, inBounds } from "../engine/coords";
import { powderKegLegalFromShots, scoutArea } from "../engine/gambit";
import { isSunk } from "../engine/game";
import { shipCells } from "../engine/placement";
import { randInt, type Rng } from "../engine/rng";
import type { GambitParams } from "../engine/gambit";
import type { Coord, Placement, ShipState, Shot } from "../engine/types";
import { activeHits, untried } from "./common";
import { huntPool } from "./medium";
import { shotFor, type Difficulty } from "./shot";
import type { Knowledge } from "./knowledge";

/**
 * What the AI legitimately knows about its own side: its own fleet and
 * the shots the opponent has fired at it. Never the opponent's board.
 */
export interface SelfView {
  readonly fleet: readonly ShipState[];
  readonly incoming: readonly Shot[];
}

export type AiAction =
  | { type: "gambit"; params: GambitParams }
  | { type: "fire"; coord: Coord };

/**
 * Decide whether to use the Gambit this turn, and with what params.
 * Returns null to take a normal shot instead.
 *
 * "Hunt mode" means no live hit data (activeHits empty); the Easy AI
 * never tracks targets, so it is always in hunt mode.
 */
export function decideGambit(
  k: Knowledge,
  self: SelfView,
  captain: CaptainId,
  difficulty: Difficulty,
  rng: Rng,
): GambitParams | null {
  const kind = captainSpec(captain).gambit;
  const hunting = difficulty === "easy" || activeHits(k).size === 0;

  switch (kind) {
    case "broadside": {
      if (!hunting || k.actions < 10) return null;
      const free = untried(k);
      if (free.length < 3) return null;
      const pool =
        difficulty === "medium"
          ? (() => {
              const hp = huntPool(k);
              return hp.length >= 3 ? hp : free;
            })()
          : free;
      return { kind: "broadside", targets: drawCells(pool, 3, rng) };
    }

    case "powderkeg": {
      if (!hunting) return null;
      let best: Coord[] = [];
      let bestCount = -1;
      for (let row = 0; row < k.rules.rows; row++) {
        for (let col = 0; col < k.rules.cols; col++) {
          const center = { row, col };
          const legal = powderKegLegalFromShots(k.shots, center, k.rules);
          if (!legal.ok) continue;
          const n = legal.value.length;
          if (n > bestCount) {
            bestCount = n;
            best = [center];
          } else if (n === bestCount) {
            best.push(center);
          }
        }
      }
      const pick = best[randInt(rng, Math.max(best.length, 1))];
      if (!pick) return null;
      return { kind: "powderkeg", center: pick };
    }

    case "crowsnest": {
      if (!hunting || k.actions < 5) return null;
      const free = new Set(untried(k).map(coordKey));
      let best: Coord[] = [];
      let bestCount = -1;
      for (let row = 0; row < k.rules.rows; row++) {
        for (let col = 0; col < k.rules.cols; col++) {
          const center = { row, col };
          const n = scoutArea(center, k.rules).filter((c) =>
            free.has(coordKey(c)),
          ).length;
          if (n > bestCount) {
            bestCount = n;
            best = [center];
          } else if (n === bestCount) {
            best.push(center);
          }
        }
      }
      const pick = best[randInt(rng, Math.max(best.length, 1))];
      if (!pick) return null;
      return { kind: "crowsnest", center: pick };
    }

    case "ghostship":
      return decideGhostShip(k, self, rng);
  }
}

/**
 * Move the most damaged unsunk ship (ties: fleet order) to a random
 * legal berth: in bounds, not overlapping another own ship, covering no
 * cell the opponent has fired at, and not the ship's current position.
 * Falls through to the next damaged ship, then null.
 */
function decideGhostShip(
  k: Knowledge,
  self: SelfView,
  rng: Rng,
): GambitParams | null {
  const incoming = new Set(self.incoming.map((s) => coordKey(s.coord)));
  const damaged = self.fleet
    .filter((sh) => sh.hits >= 1 && !isSunk(sh, k.rules))
    .sort((a, b) => b.hits - a.hits); // stable: ties keep fleet order
  for (const ship of damaged) {
    const ownCells = new Set(
      self.fleet
        .filter((sh) => sh.id !== ship.id)
        .flatMap((sh) => shipCells(sh, k.rules).map(coordKey)),
    );
    const candidates: Placement[] = [];
    for (const orientation of ["H", "V"] as const) {
      for (let row = 0; row < k.rules.rows; row++) {
        for (let col = 0; col < k.rules.cols; col++) {
          if (
            row === ship.row &&
            col === ship.col &&
            orientation === ship.orientation
          ) {
            continue; // same position is not a relocation
          }
          const to: Placement = { id: ship.id, row, col, orientation };
          const cells = shipCells(to, k.rules);
          if (!cells.every((c) => inBounds(c, k.rules))) continue;
          if (cells.some((c) => ownCells.has(coordKey(c)))) continue;
          if (cells.some((c) => incoming.has(coordKey(c)))) continue;
          candidates.push(to);
        }
      }
    }
    const pick = candidates[randInt(rng, Math.max(candidates.length, 1))];
    if (pick) {
      return { kind: "ghostship", to: pick };
    }
  }
  return null;
}

/** Draw `n` distinct cells from `pool` without replacement. */
function drawCells(pool: readonly Coord[], n: number, rng: Rng): Coord[] {
  const bag = [...pool];
  const out: Coord[] = [];
  for (let i = 0; i < n && bag.length > 0; i++) {
    const [c] = bag.splice(randInt(rng, bag.length), 1);
    if (c) out.push(c);
  }
  return out;
}

/**
 * Pick this turn's action: the Gambit when it is still available and
 * decideGambit finds a worthwhile use, otherwise a normal shot.
 */
export function aiAction(
  k: Knowledge,
  self: SelfView,
  gambit: { captain: CaptainId; used: boolean } | null,
  difficulty: Difficulty,
  rng: Rng,
): AiAction {
  if (gambit && !gambit.used) {
    const params = decideGambit(k, self, gambit.captain, difficulty, rng);
    if (params) return { type: "gambit", params };
  }
  return { type: "fire", coord: shotFor(difficulty, k, rng) };
}
