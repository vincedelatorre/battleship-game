export type ShipId =
  | "carrier"
  | "battleship"
  | "cruiser"
  | "submarine"
  | "destroyer";

export interface ShipSpec {
  readonly id: ShipId;
  readonly length: number;
}

export const FLEET: readonly ShipSpec[] = [
  { id: "carrier", length: 5 },
  { id: "battleship", length: 4 },
  { id: "cruiser", length: 3 },
  { id: "submarine", length: 3 },
  { id: "destroyer", length: 2 },
];

export interface Rules {
  readonly rows: number;
  readonly cols: number;
  readonly fleet: readonly ShipSpec[];
  readonly gambit: boolean;
  readonly variants: {
    readonly salvo: false;
    readonly salvoHiddenHits: false;
    readonly hotColdHints: false;
    readonly fogRevealOnSink: false;
  };
}

export const RULES: Rules = {
  rows: 10,
  cols: 10,
  fleet: FLEET,
  gambit: false,
  variants: {
    salvo: false,
    salvoHiddenHits: false,
    hotColdHints: false,
    fogRevealOnSink: false,
  },
};

export function shipLength(id: ShipId, rules: Rules = RULES): number {
  const spec = rules.fleet.find((s) => s.id === id);
  if (!spec) {
    throw new Error(`unknown ship id: ${id}`);
  }
  return spec.length;
}
