/**
 * Gerstner wave model for the storm ocean — pure math, no three.js.
 * The vertex shader in ocean.ts is generated from the same STORM_WAVES
 * table, so CPU sampling (camera bob) and GPU displacement can never drift.
 */
export interface Swell {
  /** Normalised direction of travel (unit vector in xz). */
  readonly dx: number;
  readonly dz: number;
  /** Vertical amplitude in world units. */
  readonly amp: number;
  /** Angular frequency in rad/unit: 2π / wavelength. */
  readonly freq: number;
  /** Phase speed in rad/s. */
  readonly speed: number;
  /** Steepness 0..1 — controls the horizontal Gerstner pinch. */
  readonly q: number;
}

export const STORM_WAVES: readonly Swell[] = [
  { dx: 0.86, dz: 0.51, amp: 1.7, freq: 0.075, speed: 0.9, q: 0.55 },
  { dx: -0.34, dz: 0.94, amp: 1.4, freq: 0.105, speed: 1.05, q: 0.5 },
  { dx: 0.52, dz: -0.86, amp: 0.85, freq: 0.19, speed: 1.5, q: 0.45 },
  { dx: -0.97, dz: -0.24, amp: 0.75, freq: 0.28, speed: 1.9, q: 0.35 },
  { dx: 0.22, dz: 0.98, amp: 0.55, freq: 0.38, speed: 2.3, q: 0.3 },
  { dx: -0.71, dz: 0.7, amp: 0.42, freq: 0.52, speed: 2.7, q: 0.3 },
  { dx: 0.99, dz: -0.1, amp: 0.3, freq: 0.7, speed: 3.2, q: 0.25 },
];

/** Vertical displacement at world (x, z), time t — matches the vertex shader's Y term. */
export function waveHeight(
  x: number,
  z: number,
  t: number,
  waves: readonly Swell[] = STORM_WAVES,
): number {
  let y = 0;
  for (const w of waves) {
    y += w.amp * Math.sin(w.freq * (w.dx * x + w.dz * z) + w.speed * t);
  }
  return y;
}

/** Approximate surface slope (for camera roll); finite-difference of waveHeight. */
export function waveSlope(
  x: number,
  z: number,
  t: number,
  waves: readonly Swell[] = STORM_WAVES,
): { sx: number; sz: number } {
  const e = 0.5;
  return {
    sx: (waveHeight(x + e, z, t, waves) - waveHeight(x - e, z, t, waves)) / (2 * e),
    sz: (waveHeight(x, z + e, t, waves) - waveHeight(x, z - e, t, waves)) / (2 * e),
  };
}

/** Total crest-to-trough range, for foam thresholds and tests. */
export function waveAmplitude(waves: readonly Swell[] = STORM_WAVES): number {
  let a = 0;
  for (const w of waves) a += w.amp;
  return a;
}
