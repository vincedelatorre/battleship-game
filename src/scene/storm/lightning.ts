/**
 * Procedural lightning: midpoint-displacement bolt generation and a
 * photosafety rate limiter. Pure math, no three.js — unit-testable in node.
 */
export interface BoltPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Bolt {
  readonly main: readonly BoltPoint[];
  readonly branches: readonly (readonly BoltPoint[])[];
}

export interface BoltOptions {
  /** Strike origin height. */
  readonly top?: number;
  /** Where the bolt lands on the water. */
  readonly origin?: { x: number; z: number };
  /** Sideways displacement scale of the main channel. */
  readonly jaggedness?: number;
  /** 1–3 side branches, each shorter and thinner. */
  readonly maxBranches?: number;
  readonly subdivisions?: number;
}

/**
 * Recursive midpoint displacement between `a` and `b`.
 * Returns a polyline including both endpoints (2^depth + 1 points).
 */
function midpointChain(
  a: BoltPoint,
  b: BoltPoint,
  depth: number,
  spread: number,
  rng: () => number,
): BoltPoint[] {
  if (depth === 0) return [a, b];
  const mid: BoltPoint = {
    x: (a.x + b.x) / 2 + (rng() - 0.5) * spread,
    y: (a.y + b.y) / 2 + (rng() - 0.5) * spread * 0.35,
    z: (a.z + b.z) / 2 + (rng() - 0.5) * spread,
  };
  const left = midpointChain(a, mid, depth - 1, spread * 0.55, rng);
  const right = midpointChain(mid, b, depth - 1, spread * 0.55, rng);
  return [...left.slice(0, -1), ...right];
}

/**
 * Generate one bolt: a main channel dropping to the water plus 1–3
 * branches that fork off its upper half and die in the air.
 * Deterministic for a given rng sequence.
 */
export function generateBolt(
  rng: () => number,
  opts: BoltOptions = {},
): Bolt {
  const top = opts.top ?? 120;
  const origin = opts.origin ?? { x: 0, z: -220 };
  const jaggedness = opts.jaggedness ?? 26;
  const subdivisions = opts.subdivisions ?? 6;
  const start: BoltPoint = {
    x: origin.x + (rng() - 0.5) * 60,
    y: top,
    z: origin.z + (rng() - 0.5) * 60,
  };
  const end: BoltPoint = { x: origin.x, y: 0, z: origin.z };
  const main = midpointChain(start, end, subdivisions, jaggedness, rng);

  const maxBranches = opts.maxBranches ?? 3;
  const branchCount = 1 + Math.floor(rng() * maxBranches);
  const branches: BoltPoint[][] = [];
  for (let i = 0; i < branchCount; i++) {
    // Fork off a point in the upper two-thirds of the main channel.
    const idx = Math.floor(rng() * main.length * 0.66);
    const p = main[idx] ?? start;
    const dirX = (rng() - 0.5) * 140;
    const dirZ = (rng() - 0.5) * 140;
    const tip: BoltPoint = {
      x: p.x + dirX,
      y: Math.max(10, p.y - 30 - rng() * 50),
      z: p.z + dirZ,
    };
    branches.push(
      midpointChain(p, tip, Math.max(2, subdivisions - 3), jaggedness * 0.5, rng),
    );
  }
  return { main, branches };
}

/** Which screen side a bolt struck on, for portrait/UI reactions. */
export function boltSide(x: number): "left" | "right" {
  return x < 0 ? "left" : "right";
}

/**
 * WCAG 2.3.1 flash safety: never more than `max` flashes inside any
 * `windowMs` sliding window. tryFlash(now) records and returns whether
 * a flash may happen at that instant.
 */
export class FlashLimiter {
  private times: number[] = [];

  constructor(
    private readonly max = 3,
    private readonly windowMs = 1000,
  ) {}

  tryFlash(now: number): boolean {
    this.times = this.times.filter((t) => now - t < this.windowMs);
    if (this.times.length >= this.max) return false;
    this.times.push(now);
    return true;
  }
}

/**
 * Photosensitivity: reduced-motion viewers get a capped, non-flickering flash.
 */
export function capFlashIntensity(intensity: number, reducedMotion: boolean): number {
  return reducedMotion ? Math.min(intensity, 0.3) : intensity;
}
