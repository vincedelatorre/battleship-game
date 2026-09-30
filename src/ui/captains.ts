import type { CaptainId, GambitKind } from "../engine/captains";

/**
 * Captain identities (requirements §1A.5 naming brief): original names,
 * distinct first letters, one per archetype. UI copy only — the engine
 * keeps the stable CaptainIds.
 */
export type VoiceEvent =
  | "select"
  | "hit"
  | "miss"
  | "sink"
  | "hurt"
  | "gambit"
  | "victory"
  | "defeat";

export interface CaptainProfile {
  readonly id: CaptainId;
  readonly name: string;
  /** HUD short form, e.g. "Capt. Drum". */
  readonly short: string;
  readonly archetype: string;
  readonly portrait: string;
  /** focal point for object-position when the photo is cropped */
  readonly focus: string;
  readonly flag: { readonly colors: readonly [string, string]; readonly emblem: string };
  readonly bio: string;
  readonly gambit: { readonly kind: GambitKind; readonly name: string; readonly text: string };
  readonly lines: Readonly<Record<VoiceEvent, readonly string[]>>;
}

export const CAPTAIN_PROFILES: readonly CaptainProfile[] = [
  {
    id: "captain-broadside",
    name: "Ozias Drum",
    short: "Capt. Drum",
    archetype: "Gunner",
    portrait: "/assets/captains/captain-broadside.png",
    focus: "50% 30%",
    flag: { colors: ["#2f6b3a", "#10160f"], emblem: "three black cannonballs on sea-green" },
    bio: "Forty years behind the guns. He counts in broadsides, not days.",
    gambit: {
      kind: "broadside",
      name: "Broadside",
      text: "Fire 3 shots at any 3 untried squares, one after another.",
    },
    lines: {
      select: ["Run out the guns. All of 'em."],
      hit: ["Hah! Felt that one in me boots.", "Right in the timbers!"],
      miss: ["Adjust yer aim, lads.", "Wasted powder. Again!"],
      sink: ["Down she goes, and good riddance!"],
      hurt: ["They've found our range!", "Patch that hole!"],
      gambit: ["Every gun, on my word: FIRE!"],
      victory: ["The Strait hears only my drums now."],
      defeat: ["Old Drum falls silent..."],
    },
  },
  {
    id: "captain-powderkeg",
    name: "Tamsin Kindle",
    short: "Capt. Kindle",
    archetype: "Demolitions",
    portrait: "/assets/captains/captain-powderkeg.png",
    focus: "50% 28%",
    flag: { colors: ["#b3361c", "#1a0d08"], emblem: "a lit fuse over a skull on blood-orange" },
    bio: "Blew her way out of the Saltmarsh gaol and never stopped lighting fuses.",
    gambit: {
      kind: "powderkeg",
      name: "Powder Keg",
      text: "A plus-shaped 5-square blast. Open water only.",
    },
    lines: {
      select: ["Fuse lit. Stand clear o' the splash."],
      hit: ["Kaboom! Lovely.", "That'll leave a mark."],
      miss: ["Just warming the water.", "Pity. I do love a bang."],
      sink: ["Sent to the bottom in pieces!"],
      hurt: ["Mind the powder room!", "Ow. Rude."],
      gambit: ["Roll out the keg, and run!"],
      victory: ["The Strait's been blasted clear. Mine now."],
      defeat: ["Went out with a bang, at least..."],
    },
  },
  {
    id: "captain-crowsnest",
    name: "Silas Wren",
    short: "Capt. Wren",
    archetype: "Navigator",
    portrait: "/assets/captains/captain-crow.jpg",
    focus: "56% 30%",
    flag: { colors: ["#1f5f8a", "#d8c39a"], emblem: "a gold wren in flight on deep blue" },
    bio: "The sharpest eyes in the Strait. He spots a topsail before the gulls do.",
    gambit: {
      kind: "crowsnest",
      name: "Crow's Nest",
      text: "A free scout: learn how many ship squares lie in a 3×3 area, then fire.",
    },
    lines: {
      select: ["Charts ready. I've already found them."],
      hit: ["Just as I plotted.", "Marked and struck."],
      miss: ["Noted. One less place to look.", "Empty water. Useful all the same."],
      sink: ["Scratch that one off the chart."],
      hurt: ["They're sharper than I charted!", "Hold her steady!"],
      gambit: ["Up the mast! Tell me what you see."],
      victory: ["Every reef, every wreck: mine to chart."],
      defeat: ["Should have trusted the lookout..."],
    },
  },
  {
    id: "captain-ghostship",
    name: "Vesper Hollow",
    short: "Capt. Hollow",
    archetype: "Trickster",
    portrait: "/assets/captains/captain-ghost.jpg",
    focus: "40% 34%",
    flag: { colors: ["#15181d", "#9fb8b0"], emblem: "a pale ghost-lantern on black" },
    bio: "Drowned in the Strait years ago, sent back by the sea, and never where you last looked.",
    gambit: {
      kind: "ghostship",
      name: "Ghost Ship",
      text: "Move one of your unsunk ships to a new berth and repair one hit.",
    },
    lines: {
      select: ["The sea gave me back. It'll take you instead."],
      hit: ["A chill runs through their hull.", "Found you."],
      miss: ["The fog hides you... for now.", "Mist and nothing."],
      sink: ["Another crew for the deep."],
      hurt: ["You can't kill what's already drowned.", "A scratch."],
      gambit: ["Ye'll not find her twice."],
      victory: ["The Drowned Strait keeps its own."],
      defeat: ["Back to the fog..."],
    },
  },
];

export function captainProfile(id: CaptainId): CaptainProfile {
  const p = CAPTAIN_PROFILES.find((c) => c.id === id);
  if (!p) throw new Error(`unknown captain: ${id}`);
  return p;
}

/** Deterministic pick when an rng isn't handy (cycles through the pool). */
export function voiceLine(id: CaptainId, ev: VoiceEvent, n = 0): string {
  const pool = captainProfile(id).lines[ev];
  return pool[n % pool.length] ?? "";
}

/** Small inline SVG flag: two-colour field + emblem hint. */
export function flagSvg(id: CaptainId): string {
  const p = captainProfile(id);
  const [a, b] = p.flag.colors;
  const emblem: Record<GambitKind, string> = {
    broadside: `<circle cx="14" cy="11" r="2.6" fill="${b}"/><circle cx="20" cy="11" r="2.6" fill="${b}"/><circle cx="26" cy="11" r="2.6" fill="${b}"/>`,
    powderkeg: `<circle cx="20" cy="13" r="4.2" fill="${b}"/><path d="M22 9 q4 -5 7 -4" stroke="#f2c14e" stroke-width="1.4" fill="none"/><circle cx="29.5" cy="5" r="1.6" fill="#f2c14e"/>`,
    crowsnest: `<path d="M12 13 q6 -7 9 -1 q4 -6 8 -3 q-5 1 -8 6 z" fill="${b}"/>`,
    ghostship: `<rect x="17" y="6" width="6" height="10" rx="2" fill="${b}"/><rect x="18.8" y="8" width="2.4" height="5" rx="1" fill="#f0e6b8"/>`,
  };
  return `<svg viewBox="0 0 40 24" aria-hidden="true"><rect width="40" height="24" fill="${a}"/><rect y="20" width="40" height="4" fill="${b}" opacity=".55"/>${emblem[p.gambit.kind]}</svg>`;
}
