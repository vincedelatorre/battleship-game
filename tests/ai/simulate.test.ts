import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { easyShot } from "../../src/ai/easy";
import { initialKnowledge } from "../../src/ai/knowledge";
import { playClassicGame } from "../../src/ai/simulate";
import { mulberry32 } from "../../src/engine/rng";
import { RULES } from "../../src/engine/rules";
import type { PlayerIndex } from "../../src/engine/types";

describe("easyShot", () => {
  it("picks uniform untried in-bounds cells", () => {
    const k = initialKnowledge(RULES, 0);
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const c = easyShot(k, rng);
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(10);
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(10);
    }
  });
});

describe("playClassicGame — easy vs easy", () => {
  it("plays 1,000 clean games: legal shots only, ≤100 shots per side", () => {
    for (let seed = 0; seed < 1000; seed++) {
      const r = playClassicGame({
        seed,
        difficulty: ["easy", "easy"],
        firstPlayer: (seed % 2) as PlayerIndex,
      });
      // fire() threw on any illegal shot, so reaching here means every shot
      // was untried and in bounds.
      expect(r.shots[0]).toBeLessThanOrEqual(100);
      expect(r.shots[1]).toBeLessThanOrEqual(100);
      expect(r.turns).toBeGreaterThan(17);
      expect([0, 1]).toContain(r.winner);
    }
  });
});

describe("playClassicGame — medium strength", () => {
  it("medium sinks a random fleet in clearly fewer shots than easy", () => {
    // Winner's shot count = shots needed to sink the opposing fleet.
    const winShots = (d: "easy" | "medium", games: number): number[] => {
      const out: number[] = [];
      for (let seed = 0; seed < games; seed++) {
        const r = playClassicGame({
          seed: seed + 7777,
          difficulty: [d, d],
          firstPlayer: 0,
        });
        const s = r.shots[r.winner];
        if (s === undefined) throw new Error("missing shot count");
        out.push(s);
      }
      return out;
    };
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const mediumMean = mean(winShots("medium", 500));
    const easyMean = mean(winShots("easy", 500));
    // Deterministic seeds; expect ~50-60 vs ~95.
    expect(mediumMean).toBeLessThan(75);
    expect(easyMean).toBeGreaterThan(85);
    expect(mediumMean).toBeLessThan(easyMean - 15);
  }, 30000);
});

describe("no cheating, by construction", () => {
  const aiDir = join(dirname(fileURLToPath(import.meta.url)), "../../src/ai");
  const sources = readdirSync(aiDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => [f, readFileSync(join(aiDir, f), "utf8")] as const);

  it("AI sources never see GameState, the opponent fleet, or players[]", () => {
    for (const [file, src] of sources) {
      if (file === "simulate.ts") continue; // the referee may hold GameState
      expect(src, file).not.toMatch(/GameState/);
      expect(src, file).not.toMatch(/\.fleet/);
      expect(src, file).not.toMatch(/players\[/);
    }
  });

  it("simulate.ts exists as the only referee file", () => {
    expect(sources.map(([f]) => f).sort()).toEqual(
      expect.arrayContaining(["simulate.ts"]),
    );
    expect(sources.map(([f]) => f)).toContain("simulate.ts");
  });
});
