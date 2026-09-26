import type { Rules, ShipId } from "./rules";

export type PlayerIndex = 0 | 1; // UI convention: 0 = human, 1 = AI

/** 0-based coordinate; row 0 = 'A', col 0 = '1'. */
export interface Coord {
  readonly row: number;
  readonly col: number;
}

/** H: cols increase; V: rows increase. Diagonal is not representable. */
export type Orientation = "H" | "V";

export interface Placement {
  readonly id: ShipId;
  readonly row: number;
  readonly col: number;
  readonly orientation: Orientation;
}

/** hits is a damage count, not derived from cells (Step 5.4 moves damaged ships). */
export interface ShipState extends Placement {
  readonly hits: number;
}

export type ShotResult = "miss" | "hit" | "sunk";

/** shipId is set on hit AND sunk (the defender names the ship on every hit). */
export interface Shot {
  readonly coord: Coord;
  readonly result: ShotResult;
  readonly shipId?: ShipId;
}

/** shots are shots fired BY this player at the opponent. */
export interface PlayerState {
  readonly fleet: readonly ShipState[];
  readonly shots: readonly Shot[];
}

export type GameStatus = "playing" | "over";

export interface GameState {
  readonly rules: Rules;
  readonly players: readonly [PlayerState, PlayerState];
  readonly turn: PlayerIndex;
  readonly status: GameStatus;
  readonly winner: PlayerIndex | null;
  /** +1 per accepted action. */
  readonly seq: number;
  readonly firstPlayer: PlayerIndex;
}

export type GameEvent =
  | {
      type: "shot";
      by: PlayerIndex;
      coord: Coord;
      result: ShotResult;
      shipId?: ShipId;
      seq: number;
    }
  /** emitted right after the 'shot' event whose result is 'sunk' */
  | { type: "sunk"; by: PlayerIndex; shipId: ShipId; seq: number }
  | { type: "gameOver"; winner: PlayerIndex; seq: number };

export type Result<T, E extends string> =
  | { ok: true; value: T }
  | { ok: false; error: E };
