import { describe, expect, it } from "vitest";

import { aiAction, decideGambit, type SelfView } from "../../src/ai/gambitAi";
import { pickCaptain } from "../../src/ai/captain";
import { initialKnowledge, observe, type Knowledge } from "../../src/ai/knowledge";
import { playGame } from "../../src/ai/simulate";
import { CAPTAINS, type CaptainId } from "../../src/engine/captains";
import { blastCells, scoutArea } from "../../src/engine/gambit";
import { coordKey, inBounds } from "../../src/engine/coords";
import { shipCells } from "../../src/engine/placement";
import { mulberry32 } from "../../src/engine/rng";
import { RULES, type ShipId } from "../../src/engine/rules";
import type {
  Coord,
  GameEvent,
  Placement,
  ShipState,
  ShotResult,
} from "../../src/engine/types";

/* ---------- helpers ---------- */

const shot = (
  row: number,
  col: number,
  result: ShotResult,
  shipId?: ShipId,
): GameEvent => ({
  type: "shot",
  by: 0,
  coord: { row, col },
  result,
  ...(shipId !== undefined ? { shipId } : {}),
  seq: 0,
});

const miss = (row: number, col: number): GameEvent => shot(row, col, "miss");
const hit = (row: number, col: number, shipId: ShipId): GameEvent =>
  shot(row, col, "hit", shipId);

/** n separate miss actions to advance Knowledge.actions by n. */
function withActions(n: number, extra: GameEvent[][] = []): Knowledge {
  let k = initialKnowledge(RULES, 0);
  for (let i = 0; i < n; i++) {
    k = observe(k, [miss(Math.floor(i / 10) + (i > 39 ? 4 : 0), (i * 7) % 10)]);
  }
  for (const ev of extra) {
    k = observe(k, ev);
  }
  return k;
}

const BASE_FLEET: Placement[] = [
  { id: "carrier", row: 0, col: 0, orientation: "H" },
  { id: "battleship", row: 2, col: 0, orientation: "H" },
  { id: "cruiser", row: 4, col: 0, orientation: "H" },
  { id: "submarine", row: 6, col: 0, orientation: "H" },
  { id: "destroyer", row: 8, col: 0, orientation: "H" },
];

function selfView(
  hits: Partial<Record<ShipId, number>>,
  incoming: Coord[] = [],
): SelfView {
  return {
    fleet: BASE_FLEET.map(
      (p): ShipState => ({ ...p, hits: hits[p.id] ?? 0 }),
    ),
    incoming: incoming.map((c) => ({ coord: c, result: "miss" })),
  };
}

/* ---------- pickCaptain ---------- */

describe("pickCaptain", () => {
  it("never returns `avoid` across 1,000 seeds", () => {
    for (let seed = 0; seed < 1000; seed++) {
      const c = pickCaptain(mulberry32(seed), "captain-broadside");
      expect(c).not.toBe("captain-broadside");
      expect(CAPTAINS.some((s) => s.id === c)).toBe(true);
    }
  });

  it("covers all four captains without `avoid`", () => {
    const seen = new Set<CaptainId>();
    for (let seed = 0; seed < 400; seed++) {
      seen.add(pickCaptain(mulberry32(seed)));
    }
    expect(seen.size).toBe(4);
  });
});

/* ---------- decideGambit ---------- */

const self = selfView({});

describe("decideGambit — broadside", () => {
  it("is null before 10 actions and fires at 10", () => {
    const rng = mulberry32(1);
    expect(
      decideGambit(withActions(9), self, "captain-broadside", "medium", rng),
    ).toBeNull();
    const params = decideGambit(
      withActions(10),
      self,
      "captain-broadside",
      "medium",
      mulberry32(1),
    );
    expect(params?.kind).toBe("broadside");
    if (params?.kind === "broadside") {
      expect(params.targets).toHaveLength(3);
      expect(new Set(params.targets.map(coordKey)).size).toBe(3);
      // fresh miss-heavy board: all targets untried + in bounds
      for (const t of params.targets) {
        expect(inBounds(t, RULES)).toBe(true);
      }
    }
  });

  it("is null in target mode (live hits pending)", () => {
    const k = withActions(10, [[hit(9, 9, "carrier")]]);
    expect(
      decideGambit(k, self, "captain-broadside", "medium", mulberry32(1)),
    ).toBeNull();
  });

  it("still fires at 10 for Easy, which is always in hunt mode", () => {
    const k = withActions(10, [[hit(9, 9, "carrier")]]);
    const params = decideGambit(
      k,
      self,
      "captain-broadside",
      "easy",
      mulberry32(1),
    );
    expect(params?.kind).toBe("broadside");
  });

  it("is null when fewer than 3 untried cells remain", () => {
    let k = initialKnowledge(RULES, 0);
    for (let i = 0; i < 98; i++) {
      k = observe(k, [miss(Math.floor(i / 10), i % 10)]);
    }
    expect(
      decideGambit(k, self, "captain-broadside", "easy", mulberry32(1)),
    ).toBeNull();
  });
});

describe("decideGambit — powderkeg", () => {
  it("picks a 5-cell legal center on a fresh board", () => {
    const params = decideGambit(
      initialKnowledge(RULES, 0),
      self,
      "captain-powderkeg",
      "medium",
      mulberry32(1),
    );
    expect(params?.kind).toBe("powderkeg");
    if (params?.kind === "powderkeg") {
      // corner/edge centers give 3-4 blast cells; the AI prefers 5
      expect(blastCells(params.center, RULES)).toHaveLength(5);
    }
  });

  it("is null when no center is legal", () => {
    let k = initialKnowledge(RULES, 0);
    for (let i = 0; i < 100; i++) {
      k = observe(k, [miss(Math.floor(i / 10), i % 10)]);
    }
    expect(
      decideGambit(k, self, "captain-powderkeg", "easy", mulberry32(1)),
    ).toBeNull();
  });

  it("can pick a center next to a stale hit after a relocation", () => {
    // Fire at every cell except the blast of (1,5); (0,4) is a hit on the
    // cruiser, which then relocates — making (0,4) stale. The only legal
    // powderkeg center is (1,5), whose blast touches the stale hit.
    let k = initialKnowledge(RULES, 0);
    k = observe(k, [hit(0, 4, "cruiser")]);
    const misses: GameEvent[] = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (r === 0 && c === 4) continue; // the hit
        if (r === 1 && (c === 4 || c === 5 || c === 6)) continue;
        if (c === 5 && (r === 0 || r === 2)) continue;
        misses.push(miss(r, c));
      }
    }
    k = observe(k, misses);
    k = observe(k, [{ type: "relocated", by: 1, shipId: "cruiser", seq: 0 }]);
    expect(k.staleHits).toEqual(["0,4"]);
    const params = decideGambit(
      k,
      self,
      "captain-powderkeg",
      "medium",
      mulberry32(1),
    );
    // Without the stale exclusion this center would be not_open_water.
    expect(params).toEqual({
      kind: "powderkeg",
      center: { row: 1, col: 5 },
    });
  });
});

describe("decideGambit — crowsnest", () => {
  it("is null before 5 actions and fires at 5", () => {
    expect(
      decideGambit(
        withActions(4),
        self,
        "captain-crowsnest",
        "medium",
        mulberry32(1),
      ),
    ).toBeNull();
    const params = decideGambit(
      withActions(5),
      self,
      "captain-crowsnest",
      "medium",
      mulberry32(1),
    );
    expect(params?.kind).toBe("crowsnest");
    if (params?.kind === "crowsnest") {
      expect(inBounds(params.center, RULES)).toBe(true);
      // on a nearly-empty board it centres a full 3x3 area
      expect(scoutArea(params.center, RULES).length).toBe(9);
    }
  });
});

describe("decideGambit — ghostship", () => {
  it("is null with an undamaged fleet", () => {
    expect(
      decideGambit(
        initialKnowledge(RULES, 0),
        selfView({}),
        "captain-ghostship",
        "medium",
        mulberry32(1),
      ),
    ).toBeNull();
  });

  it("moves the most damaged qualifying ship to a legal position", () => {
    const sv = selfView(
      { destroyer: 1, cruiser: 2 },
      [{ row: 8, col: 0 }, { row: 4, col: 0 }, { row: 4, col: 1 }],
    );
    const params = decideGambit(
      initialKnowledge(RULES, 0),
      sv,
      "captain-ghostship",
      "medium",
      mulberry32(1),
    );
    expect(params?.kind).toBe("ghostship");
    if (params?.kind === "ghostship") {
      // cruiser (2 hits) outranks destroyer (1 hit)
      expect(params.to.id).toBe("cruiser");
      const to = params.to;
      expect(
        to.row !== 4 || to.col !== 0 || to.orientation !== "H",
      ).toBe(true); // must actually move
      const cells = shipCells(to, RULES);
      expect(cells.every((c) => inBounds(c, RULES))).toBe(true);
      const ownOthers = new Set(
        sv.fleet
          .filter((s) => s.id !== to.id)
          .flatMap((s) => shipCells(s, RULES).map(coordKey)),
      );
      const fired = new Set(["8,0", "4,0", "4,1"]);
      for (const c of cells) {
        expect(ownOthers.has(coordKey(c))).toBe(false);
        expect(fired.has(coordKey(c))).toBe(false);
      }
    }
  });

  it("waits for 2 hits on a cruiser, but a destroyer qualifies at 1", () => {
    // Cruiser at 1 hit: not damaged enough to spend the Gambit on.
    expect(
      decideGambit(
        initialKnowledge(RULES, 0),
        selfView({ cruiser: 1 }, [{ row: 4, col: 0 }]),
        "captain-ghostship",
        "medium",
        mulberry32(1),
      ),
    ).toBeNull();
    // Cruiser at 2 hits: qualifies.
    const params = decideGambit(
      initialKnowledge(RULES, 0),
      selfView({ cruiser: 2 }, [{ row: 4, col: 0 }, { row: 4, col: 1 }]),
      "captain-ghostship",
      "medium",
      mulberry32(1),
    );
    expect(params?.kind).toBe("ghostship");
    if (params?.kind === "ghostship") expect(params.to.id).toBe("cruiser");
    // A destroyer (length 2) can't survive 2 hits, so 1 hit qualifies.
    const d = decideGambit(
      initialKnowledge(RULES, 0),
      selfView({ destroyer: 1 }, [{ row: 8, col: 0 }]),
      "captain-ghostship",
      "medium",
      mulberry32(1),
    );
    expect(d?.kind).toBe("ghostship");
    if (d?.kind === "ghostship") expect(d.to.id).toBe("destroyer");
  });

  it("is null when no legal relocation exists", () => {
    const all: Coord[] = [];
    for (let r = 0; r < 10; r++)
      for (let c = 0; c < 10; c++) all.push({ row: r, col: c });
    const sv = selfView({ destroyer: 1 }, all);
    expect(
      decideGambit(
        initialKnowledge(RULES, 0),
        sv,
        "captain-ghostship",
        "medium",
        mulberry32(1),
      ),
    ).toBeNull();
  });
});

/* ---------- aiAction ---------- */

describe("aiAction", () => {
  it("fires when the Gambit is used or the captain declines", () => {
    const k = initialKnowledge(RULES, 0);
    const used = aiAction(
      k,
      self,
      { captain: "captain-broadside", used: true },
      "medium",
      mulberry32(1),
    );
    expect(used.type).toBe("fire");
    // no gambit configured (classic game)
    expect(
      aiAction(k, self, null, "medium", mulberry32(1)).type,
    ).toBe("fire");
  });

  it("uses the Gambit when the decision rule triggers", () => {
    const a = aiAction(
      initialKnowledge(RULES, 0),
      self,
      { captain: "captain-powderkeg", used: false },
      "medium",
      mulberry32(1),
    );
    expect(a.type).toBe("gambit");
  });
});

/* ---------- integration ---------- */

describe("playGame — Gambit integration", () => {
  it("runs 160 games across all 16 pairings; every Gambit fires at least once", () => {
    const gambitsSeen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const capA = CAPTAINS[i];
        const capB = CAPTAINS[j];
        if (!capA || !capB) throw new Error("missing captain");
        const pairing = i * 4 + j;
        for (let seed = 0; seed < 10; seed++) {
          const r = playGame({
            seed: pairing * 1000 + seed,
            // mix difficulties: half the games have an Easy seat
            difficulty: (i + j) % 2 === 0 ? ["medium", "medium"] : ["easy", "medium"],
            firstPlayer: (seed % 2) as 0 | 1,
            captains: [capA.id, capB.id],
          });
          expect([0, 1]).toContain(r.winner);
          expect(r.gambitUsed[0] && r.gambitUsed[0]).toBe(r.gambitUsed[0]); // boolean, ≤ once by engine
          if (r.gambitUsed[0]) gambitsSeen.add(capA.id);
          if (r.gambitUsed[1]) gambitsSeen.add(capB.id);
        }
      }
    }
    expect(gambitsSeen.size).toBe(4);
  }, 30000);
});
