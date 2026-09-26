import { describe, expect, it } from "vitest";

import { FLEET, RULES, shipLength, type ShipId } from "../../src/engine/rules";

describe("RULES", () => {
  it("is the classic 10x10 game with gambit and all variants off", () => {
    expect(RULES.rows).toBe(10);
    expect(RULES.cols).toBe(10);
    expect(RULES.gambit).toBe(false);
    expect(RULES.variants).toEqual({
      salvo: false,
      salvoHiddenHits: false,
      hotColdHints: false,
      fogRevealOnSink: false,
    });
    expect(RULES.fleet).toBe(FLEET);
  });

  it("defines the Hasbro fleet in order", () => {
    expect(FLEET.map((s) => s.id)).toEqual([
      "carrier",
      "battleship",
      "cruiser",
      "submarine",
      "destroyer",
    ]);
    expect(FLEET.map((s) => s.length)).toEqual([5, 4, 3, 3, 2]);
  });

  it("shipLength returns each ship's length", () => {
    expect(shipLength("carrier")).toBe(5);
    expect(shipLength("battleship")).toBe(4);
    expect(shipLength("cruiser")).toBe(3);
    expect(shipLength("submarine")).toBe(3);
    expect(shipLength("destroyer")).toBe(2);
  });

  it("shipLength throws on an unknown ship id", () => {
    expect(() => shipLength("schooner" as ShipId)).toThrow();
  });
});
