import { CAPTAINS, type CaptainId } from "../engine/captains";
import type { Difficulty } from "../ai/shot";

/** What the setup screens decide; persisted so the next voyage remembers. */
export type Mode = "standard" | "gambit";

export interface MatchConfig {
  readonly mode: Mode;
  readonly difficulty: Difficulty;
  readonly captain: CaptainId;
}

const KEYS = { mode: "pb.mode", difficulty: "pb.difficulty", captain: "pb.captain" } as const;

function get(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function set(k: string, v: string): void {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* private mode — non-fatal */
  }
}

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: "Deckhand",
  medium: "Buccaneer",
};

export function loadConfig(): MatchConfig {
  const mode = get(KEYS.mode) === "gambit" ? "gambit" : "standard";
  const difficulty = get(KEYS.difficulty) === "easy" ? "easy" : "medium";
  const stored = get(KEYS.captain);
  const captain = CAPTAINS.some((c) => c.id === stored)
    ? (stored as CaptainId)
    : "captain-crowsnest";
  return { mode, difficulty, captain };
}

export function saveConfig(c: MatchConfig): void {
  set(KEYS.mode, c.mode);
  set(KEYS.difficulty, c.difficulty);
  set(KEYS.captain, c.captain);
}
