export type CaptainId =
  | "captain-broadside"
  | "captain-powderkeg"
  | "captain-crowsnest"
  | "captain-ghostship";

export type GambitKind = "broadside" | "powderkeg" | "crowsnest" | "ghostship";

export interface CaptainSpec {
  readonly id: CaptainId;
  readonly archetype: "Gunner" | "Demolitions" | "Navigator" | "Trickster";
  readonly gambit: GambitKind;
  /** Placeholder until the §1A.5 naming pass. */
  readonly placeholderName: string;
}

export const CAPTAINS: readonly CaptainSpec[] = [
  {
    id: "captain-broadside",
    archetype: "Gunner",
    gambit: "broadside",
    placeholderName: "Captain Broadside",
  },
  {
    id: "captain-powderkeg",
    archetype: "Demolitions",
    gambit: "powderkeg",
    placeholderName: "Captain Powderkeg",
  },
  {
    id: "captain-crowsnest",
    archetype: "Navigator",
    gambit: "crowsnest",
    placeholderName: "Captain Crow",
  },
  {
    id: "captain-ghostship",
    archetype: "Trickster",
    gambit: "ghostship",
    placeholderName: "Captain Ghost",
  },
];

export function captainSpec(id: CaptainId): CaptainSpec {
  const spec = CAPTAINS.find((c) => c.id === id);
  if (!spec) {
    throw new Error(`unknown captain id: ${id}`);
  }
  return spec;
}
