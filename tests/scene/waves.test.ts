import { describe, expect, it } from "vitest";
import {
  STORM_WAVES,
  waveAmplitude,
  waveHeight,
  waveSlope,
} from "../../src/scene/storm/waves";

describe("storm wave model", () => {
  it("has 6–8 Gerstner waves in a storm-swell range", () => {
    expect(STORM_WAVES.length).toBeGreaterThanOrEqual(6);
    expect(STORM_WAVES.length).toBeLessThanOrEqual(8);
    const dominant = Math.max(...STORM_WAVES.map((w) => w.amp));
    expect(dominant).toBeGreaterThanOrEqual(1.5);
    expect(dominant).toBeLessThanOrEqual(3);
    for (const w of STORM_WAVES) {
      // unit direction
      expect(Math.hypot(w.dx, w.dz)).toBeCloseTo(1, 1);
      expect(w.freq).toBeGreaterThan(0);
      expect(w.q).toBeGreaterThan(0);
      expect(w.q).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    for (const [x, z, t] of [
      [0, 26, 0],
      [13.5, -40, 12.3],
      [-100, 200, 77],
    ] as const) {
      expect(waveHeight(x, z, t)).toBe(waveHeight(x, z, t));
    }
  });

  it("stays within the summed amplitude and varies over time", () => {
    const max = waveAmplitude();
    const seen = new Set<number>();
    for (let t = 0; t < 20; t += 0.5) {
      const h = waveHeight(0, 26, t);
      expect(Math.abs(h)).toBeLessThanOrEqual(max + 1e-9);
      seen.add(Math.round(h * 1000));
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it("waveSlope is finite and vanishes on a flat wave set", () => {
    const flat = [{ dx: 1, dz: 0, amp: 0, freq: 0.1, speed: 1, q: 0.5 }];
    const s = waveSlope(3, 4, 2, flat);
    expect(s.sx).toBeCloseTo(0);
    expect(s.sz).toBeCloseTo(0);
    const real = waveSlope(0, 26, 3);
    expect(Number.isFinite(real.sx)).toBe(true);
    expect(Number.isFinite(real.sz)).toBe(true);
  });
});
