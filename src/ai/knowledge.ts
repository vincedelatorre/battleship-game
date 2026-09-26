import { coordKey } from "../engine/coords";
import type { Rules, ShipId } from "../engine/rules";
import type { Coord, GameEvent, PlayerIndex, Shot } from "../engine/types";

/**
 * Everything an AI player knows, derived only from public GameEvents.
 * The AI learns nothing that isn't in this structure.
 */
export interface Knowledge {
  readonly rules: Rules;
  readonly me: PlayerIndex;
  /** My own shots, in order (built from my 'shot' events). */
  readonly shots: readonly Shot[];
  /** Enemy ships I have sunk. */
  readonly sunk: readonly ShipId[];
  /** coordKeys of my hits on enemy ships that later relocated (Ghost
   *  Ship): history, not targets. */
  readonly staleHits: readonly string[];
  /** Last Crow's Nest scout I performed. Cleared whenever the enemy
   *  relocates a ship, since the count may no longer be true. */
  readonly scout?: { readonly center: Coord; readonly count: number };
  /** How many of my turns I've completed. A Gambit that ends my turn
   *  counts as 1; Crow's Nest (a free action) counts 0. */
  readonly actions: number;
}

export function initialKnowledge(rules: Rules, me: PlayerIndex): Knowledge {
  return {
    rules,
    me,
    shots: [],
    sunk: [],
    staleHits: [],
    scout: undefined,
    actions: 0,
  };
}

/**
 * Fold one engine action's events into the knowledge base.
 *
 * Contract: the caller passes the events of exactly one engine action
 * (one fire() or one useGambit()) per call. Action counting relies on
 * this: a call counts as one completed action iff it contains a shot by
 * me (a plain fire) or a Gambit announcement by me that isn't
 * crowsnest — so a Broadside's three shots still count as a single
 * action, while Crow's Nest counts zero and the following fire counts
 * one.
 */
export function observe(k: Knowledge, events: readonly GameEvent[]): Knowledge {
  const shots = [...k.shots];
  const sunk = [...k.sunk];
  const stale = new Set(k.staleHits);
  let scout = k.scout;
  let acted = false;
  for (const e of events) {
    if (e.type === "shot" && e.by === k.me) {
      shots.push(
        e.shipId === undefined
          ? { coord: e.coord, result: e.result }
          : { coord: e.coord, result: e.result, shipId: e.shipId },
      );
      acted = true;
    } else if (e.type === "sunk" && e.by === k.me) {
      sunk.push(e.shipId);
    } else if (e.type === "relocated" && e.by !== k.me) {
      // The enemy moved a ship I had hit: those hits are stale history,
      // and any scout count is no longer trustworthy.
      for (const s of shots) {
        if ((s.result === "hit" || s.result === "sunk") && s.shipId === e.shipId) {
          stale.add(coordKey(s.coord));
        }
      }
      scout = undefined;
    } else if (e.type === "scout" && e.by === k.me) {
      scout = { center: e.center, count: e.count };
    } else if (e.type === "gambit" && e.by === k.me && e.gambit !== "crowsnest") {
      acted = true;
    }
    // Other event types (opponents' events) carry nothing the targeting
    // code needs.
  }
  return {
    ...k,
    shots,
    sunk,
    staleHits: [...stale],
    scout,
    actions: acted ? k.actions + 1 : k.actions,
  };
}
