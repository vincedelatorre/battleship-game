import {
  coordLabel,
  isSunk,
  sameCoord,
  shipCells,
  shipLength,
  type Coord,
  type GameEvent,
  type GameState,
  type Placement,
  type PlayerIndex,
  type ShipId,
  type Shot,
} from "../../engine/index";
import { SHIP_NAMES } from "./controller";

/**
 * Everything the battle sidebars show, derived from public game state.
 * Pure: no DOM, no three.js. The enemy section is built ONLY from our own
 * shots (ship names on hits, sunk announcements) — the enemy fleet is never
 * read, so nothing leaks that a human opponent wouldn't know.
 */
export interface SidebarModel {
  own: {
    id: ShipId;
    name: string;
    length: number;
    /** indices along the ship (0..len-1, bow to stern) the enemy has hit */
    hitCells: number[];
    sunk: boolean;
  }[];
  /** enemy misses in our waters (white rings on the mini chart) */
  ownMisses: Coord[];
  /** enemy hits in our waters (red X's on the mini chart) */
  ownHits: Coord[];
  /** our fleet, for the mini chart hulls */
  ownPlacements: Placement[];
  enemy: {
    id: ShipId;
    name: string;
    length: number;
    /** confirmed hits — count only, never positions */
    hits: number;
    sunk: boolean;
  }[];
  myShots: Shot[];
  stats: {
    shots: number;
    hits: number;
    accuracy: number;
    ownAfloat: number;
    enemyAfloat: number;
  };
}

export function sidebarModel(state: GameState, me: PlayerIndex = 0): SidebarModel {
  const other: PlayerIndex = me === 0 ? 1 : 0;
  const rules = state.rules;
  const mine = state.players[me];
  const incoming = state.players[other].shots;

  const own = mine.fleet.map((ship) => {
    const cells = shipCells(ship, rules);
    // match incoming shots against the ship's CURRENT cells — a Ghost Ship
    // move simply moves the damage display with the hull
    const hitCells = cells.flatMap((c, i) =>
      incoming.some((s) => s.result !== "miss" && sameCoord(s.coord, c))
        ? [i]
        : [],
    );
    return {
      id: ship.id,
      name: SHIP_NAMES[ship.id],
      length: shipLength(ship.id, rules),
      hitCells,
      sunk: isSunk(ship, rules),
    };
  });

  const enemy = rules.fleet.map((spec) => {
    const hits = mine.shots.filter(
      (s) => s.shipId === spec.id && s.result !== "miss",
    ).length;
    const sunk = mine.shots.some(
      (s) => s.result === "sunk" && s.shipId === spec.id,
    );
    return {
      id: spec.id,
      name: SHIP_NAMES[spec.id],
      length: spec.length,
      hits: Math.min(hits, spec.length),
      sunk,
    };
  });

  const hits = mine.shots.filter((s) => s.result !== "miss").length;
  return {
    own,
    ownMisses: incoming.filter((s) => s.result === "miss").map((s) => s.coord),
    ownHits: incoming.filter((s) => s.result !== "miss").map((s) => s.coord),
    ownPlacements: mine.fleet.map((s) => ({
      id: s.id,
      row: s.row,
      col: s.col,
      orientation: s.orientation,
    })),
    enemy,
    myShots: [...mine.shots],
    stats: {
      shots: mine.shots.length,
      hits,
      accuracy: mine.shots.length ? hits / mine.shots.length : 0,
      ownAfloat: own.filter((s) => !s.sunk).length,
      enemyAfloat: enemy.filter((s) => !s.sunk).length,
    },
  };
}

/**
 * One Captain's-Log line per engine event, newest-first list is the caller's
 * job. `by` = who acted (0 = the player). Returns null for events the log
 * doesn't record (scout reports, relocations, the sunk marker that already
 * rode its shot event).
 */
export function logLine(by: PlayerIndex, e: GameEvent): string | null {
  if (e.type === "shot") {
    const label = coordLabel(e.coord);
    const name = e.shipId !== undefined ? SHIP_NAMES[e.shipId] : "";
    if (by === 0) {
      if (e.result === "miss") return `You fire ${label} — miss.`;
      if (e.result === "hit") return `You fire ${label} — hit, ${name}!`;
      return `You sank their ${name}!`;
    }
    if (e.result === "miss") return `Enemy fires ${label} — miss.`;
    if (e.result === "hit") return `Enemy fires ${label} — hit, our ${name}!`;
    return `They sank our ${name}!`;
  }
  if (e.type === "gameOver") {
    return e.winner === 0
      ? "Victory — the Strait is ours!"
      : "Defeat — our fleet rests on the bottom.";
  }
  return null;
}
