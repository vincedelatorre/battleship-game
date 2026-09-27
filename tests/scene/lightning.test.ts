import { describe, expect, it } from "vitest";
import {
  FlashLimiter,
  boltSide,
  capFlashIntensity,
  generateBolt,
} from "../../src/scene/storm/lightning";
import { mulberry32 } from "../../src/engine/rng";

describe("bolt generator", () => {
  it("is deterministic for a seeded rng", () => {
    const a = generateBolt(mulberry32(42));
    const b = generateBolt(mulberry32(42));
    expect(a.main).toEqual(b.main);
    expect(a.branches).toEqual(b.branches);
  });

  it("main channel has 2^depth + 1 points and drops from top to y=0", () => {
    const bolt = generateBolt(mulberry32(7), { subdivisions: 6, top: 120 });
    expect(bolt.main.length).toBe(65);
    expect(bolt.main[0]!.y).toBe(120);
    expect(bolt.main.at(-1)!.y).toBe(0);
  });

  it("keeps segment counts and branches within bounds over 500 seeds", () => {
    for (let s = 0; s < 500; s++) {
      const bolt = generateBolt(mulberry32(s));
      expect(bolt.main.length).toBe(65); // subdivisions default 6
      expect(bolt.branches.length).toBeGreaterThanOrEqual(1);
      expect(bolt.branches.length).toBeLessThanOrEqual(3);
      for (const br of bolt.branches) {
        expect(br.length).toBe(9); // subdivisions 6 - 3 = 3 → 2^3+1
        expect(br[0]!.y).toBeGreaterThan(0); // forks in the air
      }
      for (const p of bolt.main) expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("boltSide reports the screen side", () => {
    expect(boltSide(-1)).toBe("left");
    expect(boltSide(3)).toBe("right");
  });
});

describe("FlashLimiter (WCAG 2.3.1: ≤3 flashes per second)", () => {
  it("never allows a 4th flash inside 1 s", () => {
    const l = new FlashLimiter();
    expect(l.tryFlash(0)).toBe(true);
    expect(l.tryFlash(300)).toBe(true);
    expect(l.tryFlash(600)).toBe(true);
    expect(l.tryFlash(700)).toBe(false);
    expect(l.tryFlash(999)).toBe(false);
  });

  it("admits a flash once the oldest leaves the window", () => {
    const l = new FlashLimiter();
    l.tryFlash(0);
    l.tryFlash(300);
    l.tryFlash(600);
    expect(l.tryFlash(1000)).toBe(true); // t=0 expired
    expect(l.tryFlash(1200)).toBe(false);
    expect(l.tryFlash(1300)).toBe(true); // t=300 expired
  });

  it("caps flash brightness at 30% under reduced motion", () => {
    expect(capFlashIntensity(1, true)).toBe(0.3);
    expect(capFlashIntensity(0.2, true)).toBe(0.2);
    expect(capFlashIntensity(1, false)).toBe(1);
  });
});
