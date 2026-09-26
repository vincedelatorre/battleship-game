export * from "./rules";
export * from "./types";
export * from "./coords";
export * from "./rng";
export * from "./placement";
export * from "./captains";
export {
  createGame,
  fire,
  isSunk,
  remainingShips,
  rematch,
  shipAt,
  type CreateError,
  type FireError,
} from "./game";
export {
  blastCells,
  powderKegLegal,
  powderKegLegalFromShots,
  scoutArea,
  useGambit,
  type GambitError,
  type GambitParams,
} from "./gambit";
