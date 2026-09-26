import { describe, expect, it } from "vitest";

import { activeHits, remainingLengths, untried } from "../../src/ai/common";
import { initialKnowledge, observe } from "../../src/ai/knowledge";
import { RULES } from "../../src/engine/rules";
import type {
  GameEvent,
  PlayerIndex,
  ShotResult,
} from "../../src/engine/types";
import type { ShipId } from "../../src/engine/rules";

const shotEv = (
  by: PlayerIndex,
  row: number,
  col: number,
  result: ShotResult,
  shipId?: ShipId,
): GameEvent => ({
  type: "shot",
  by,
  coord: { row, col },
  result,
  ...(shipId !== undefined ? { shipId } : {}),
  seq: 0,
});

const sunkEv = (by: PlayerIndex, shipId: ShipId): GameEvent => ({
  type: "sunk",
  by,
  shipId,
  seq: 0,
});

describe("initialKnowledge", () => {
  it("starts empty", () => {
    const k = initialKnowledge(RULES, 0);
    expect(k.me).toBe(0);
    expect(k.shots).toEqual([]);
    expect(k.sunk).toEqual([]);
    expect(k.staleHits).toEqual([]);
    expect(k.actions).toBe(0);
    expect(untried(k)).toHaveLength(100);
  });
});

describe("observe", () => {
  it("appends only my own shot events", () => {
    let k = initialKnowledge(RULES, 0);
    k = observe(k, [
      shotEv(0, 0, 0, "hit", "cruiser"),
      shotEv(1, 5, 5, "hit", "battleship"), // opponent's shot at me: ignored
    ]);
    expect(k.shots).toEqual([
      { coord: { row: 0, col: 0 }, result: "hit", shipId: "cruiser" },
    ]);
    expect(untried(k)).toHaveLength(99);
  });

  it("records only ships I sunk", () => {
    let k = initialKnowledge(RULES, 0);
    k = observe(k, [shotEv(0, 9, 9, "sunk", "destroyer"), sunkEv(0, "destroyer")]);
    k = observe(k, [shotEv(1, 0, 0, "sunk", "submarine"), sunkEv(1, "submarine")]);
    expect(k.sunk).toEqual(["destroyer"]);
    expect(remainingLengths(k)).toEqual([5, 4, 3, 3]);
  });

  it("a sunk shot is also appended to my shots", () => {
    let k = initialKnowledge(RULES, 1);
    k = observe(k, [shotEv(1, 0, 0, "sunk", "carrier"), sunkEv(1, "carrier")]);
    expect(k.shots[0]?.result).toBe("sunk");
    expect(activeHits(k).size).toBe(0); // sunk ships leave no active hits
  });

  it("marks my hits on a relocated enemy ship as stale", () => {
    let k = initialKnowledge(RULES, 0);
    k = observe(k, [
      shotEv(0, 0, 4, "hit", "cruiser"),
      shotEv(0, 5, 5, "hit", "submarine"),
    ]);
    k = observe(k, [
      { type: "relocated", by: 1, shipId: "cruiser", seq: 0 },
    ]);
    expect(k.staleHits).toEqual(["0,4"]);
    // The stale hit is no longer an active target; the other ship's is.
    expect([...activeHits(k).keys()]).toEqual(["submarine"]);
    expect(remainingLengths(k)).toEqual([5, 4, 3, 3, 2]); // cruiser not sunk
  });

  it("ignores my own relocation (Ghost Ship I played)", () => {
    let k = initialKnowledge(RULES, 0);
    k = observe(k, [shotEv(0, 0, 4, "hit", "cruiser")]);
    k = observe(k, [{ type: "relocated", by: 0, shipId: "cruiser", seq: 0 }]);
    expect(k.staleHits).toEqual([]);
  });

  it("counts completed actions: fire +1, multi-shot Gambit +1, Crow's Nest 0", () => {
    let k = initialKnowledge(RULES, 0);
    k = observe(k, [shotEv(0, 0, 0, "miss")]);
    expect(k.actions).toBe(1);
    k = observe(k, [
      { type: "gambit", by: 0, captain: "captain-broadside", gambit: "broadside", seq: 0 },
      shotEv(0, 1, 1, "miss"),
      shotEv(0, 2, 2, "miss"),
      shotEv(0, 3, 3, "miss"),
    ]);
    expect(k.actions).toBe(2); // one observe call = one action
    k = observe(k, [
      { type: "gambit", by: 0, captain: "captain-crowsnest", gambit: "crowsnest", seq: 0 },
      { type: "scout", by: 0, center: { row: 4, col: 4 }, count: 2, seq: 0 },
    ]);
    expect(k.actions).toBe(2); // free action
    // Opponent events never count.
    k = observe(k, [shotEv(1, 0, 0, "miss")]);
    expect(k.actions).toBe(2);
  });

  it("never mutates the previous knowledge", () => {
    const k0 = initialKnowledge(RULES, 0);
    const k1 = observe(k0, [shotEv(0, 0, 0, "miss")]);
    expect(k0.shots).toEqual([]);
    expect(k1.shots).toHaveLength(1);
    expect(k1).not.toBe(k0);
  });
});

describe("common helpers", () => {
  it("activeHits groups only live, non-stale hits by ship", () => {
    let k = initialKnowledge(RULES, 0);
    k = observe(k, [
      shotEv(0, 0, 0, "hit", "carrier"),
      shotEv(0, 0, 1, "hit", "carrier"),
      shotEv(0, 5, 5, "hit", "submarine"),
      shotEv(0, 9, 9, "sunk", "destroyer"),
      sunkEv(0, "destroyer"),
    ]);
    const hits = activeHits(k);
    expect(hits.get("carrier")).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(hits.get("submarine")).toEqual([{ row: 5, col: 5 }]);
    expect(hits.has("destroyer")).toBe(false); // sunk ships are not targets
  });
});
