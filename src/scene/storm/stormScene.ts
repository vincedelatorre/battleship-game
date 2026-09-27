import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  BoxGeometry,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mulberry32 } from "../../engine/rng";
import { STORM_WAVES, waveHeight, waveSlope } from "./waves";
import {
  FlashLimiter,
  boltSide,
  capFlashIntensity,
  generateBolt,
  type BoltPoint,
} from "./lightning";
import { createOcean } from "./ocean";
import { createSky } from "./sky";
import { RAIN_HIGH, RAIN_LOW, createRain, tickRain } from "./rain";

export type Quality = "auto" | "low" | "high";

export interface LightningEvent {
  /** 0..1 — how bright the flash is (after photosafety capping). */
  readonly intensity: number;
  readonly side: "left" | "right";
  /** World distance of the strike — drives thunder delay/loudness. */
  readonly distance: number;
}

export interface StormScene {
  setQuality(q: Quality): void;
  setReducedMotion(on: boolean): void;
  onLightning(cb: (e: LightningEvent) => void): void;
  /** Force a strike now (debug/screenshot hook). */
  strike(intensity?: number): void;
  dispose(): void;
}

interface ActiveBolt {
  meshes: Mesh[];
  born: number;
  life: number;
  intensity: number;
  flicker: readonly number[];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function devicePrefersLow(): boolean {
  if (typeof navigator === "undefined") return false;
  const weakCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches === true;
  return weakCpu || coarse;
}

export function createStormScene(canvas: HTMLCanvasElement): StormScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMappingExposure = 1.15;

  const scene = new Scene();
  scene.background = new Color(0x050a12);

  const camera = new PerspectiveCamera(58, 1, 0.1, 1400);
  const CAM_Z = 26;
  const CAM_Y = 3.8;
  camera.position.set(0, CAM_Y, CAM_Z);
  camera.lookAt(0, 0.8, -200);

  // --- environment ---
  const { mesh: ocean, material: oceanMat } = createOcean();
  scene.add(ocean);
  const { mesh: sky, material: skyMat } = createSky();
  scene.add(sky);
  const { mesh: rain, setDensity } = createRain(RAIN_HIGH);
  scene.add(rain);

  const ambient = new AmbientLight(0x24303c, 0.55);
  scene.add(ambient);
  const moon = new DirectionalLight(0x8fa8c8, 0.5);
  moon.position.set(30, 42, -300); // matches the cloud-gap azimuth in the shaders
  scene.add(moon);

  // Distant ship silhouette with a swinging lantern — revealed by flashes.
  const ship = new Mesh(
    new BoxGeometry(8, 1.8, 2),
    new MeshBasicMaterial({ color: 0x04070c }),
  );
  const mast = new Mesh(
    new BoxGeometry(0.35, 6.5, 0.35),
    new MeshBasicMaterial({ color: 0x04070c }),
  );
  mast.position.y = 3.5;
  ship.add(mast);
  ship.position.set(150, 0, -320); // small silhouette, right of centre
  const lantern = new PointLight(0xffa050, 30, 90, 1.8);
  lantern.position.y = 8;
  ship.add(lantern);
  scene.add(ship);

  // --- post ---
  let quality: Exclude<Quality, "auto"> = devicePrefersLow() ? "low" : "high";
  let reducedMotion = prefersReducedMotion();
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.4, 0.45, 0.78);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let useBloom = true;

  function applyQuality(q: Quality) {
    const eff = q === "auto" ? (devicePrefersLow() ? "low" : "high") : q;
    quality = eff;
    renderer.setPixelRatio(
      eff === "high" ? Math.min(window.devicePixelRatio, 1.5) : 1,
    );
    setDensity(eff === "high" ? RAIN_HIGH : RAIN_LOW);
    useBloom = eff === "high";
    resize();
  }

  // --- lightning ---
  const rng = mulberry32((Date.now() & 0x7fffffff) | 1);
  const limiter = new FlashLimiter(3, 1000);
  const listeners: ((e: LightningEvent) => void)[] = [];
  const bolts: ActiveBolt[] = [];
  const debugStrike =
    typeof location !== "undefined" &&
    (new URLSearchParams(location.search).get("debug") === "strike" ||
      new URLSearchParams(location.search).has("strike"));

  let nextStrikeAt = debugStrike ? 0.9 : 4 + rng() * 7;
  let clock = 0;

  /**
   * Camera-facing triangle ribbon along a polyline — the bolt's visible body.
   * `width` is in world units at the bolt's distance (~220), so 0.7 ≈ 2–4 px
   * of core; a second wider ribbon provides the soft additive glow.
   */
  function ribbon(
    pts: readonly BoltPoint[],
    width: number,
    color: Color,
    opacity: number,
  ): Mesh {
    const n = pts.length;
    const pos: number[] = [];
    const idx: number[] = [];
    const seg = new Vector3();
    const view = new Vector3();
    const perp = new Vector3();
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const pPrev = pts[Math.max(0, i - 1)]!;
      const pNext = pts[Math.min(n - 1, i + 1)]!;
      seg.set(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
      view.set(p.x, p.y, p.z).sub(camera.position);
      // taper toward the tips — thin at the ground strike and at branch ends
      const taper = 1 - (i / (n - 1)) * 0.55;
      perp.crossVectors(seg, view).normalize().multiplyScalar((width * taper) / 2);
      pos.push(p.x - perp.x, p.y - perp.y, p.z - perp.z);
      pos.push(p.x + perp.x, p.y + perp.y, p.z + perp.z);
      if (i > 0) {
        const k = (i - 1) * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.baseOpacity = opacity;
    return mesh;
  }

  const CORE = new Color(3.2, 3.4, 4.0); // HDR white-blue: blooms hard
  const GLOW = new Color(0.5, 0.65, 1.0);

  function strike(intensity = 0.75 + rng() * 0.25) {
    const origin = {
      x: (rng() - 0.5) * 400,
      z: -190 - rng() * 110,
    };
    const bolt = generateBolt(rng, {
      origin,
      top: 110 + rng() * 50,
      subdivisions: 8, // jagged at small scale: 257-point main channel
    });
    const meshes = [
      ribbon(bolt.main, 2.6, GLOW, 0.24),
      ribbon(bolt.main, 0.7, CORE, 1),
    ];
    for (const b of bolt.branches) {
      meshes.push(ribbon(b, 1.2, GLOW, 0.16), ribbon(b, 0.35, CORE, 0.7));
    }
    for (const m of meshes) scene.add(m);
    // sky blooms around the strike azimuth; water spec-faces it
    skyMat.uniforms.uStrike!.value = {
      x: origin.x,
      y: 55,
      z: origin.z,
    };
    const sd = skyMat.uniforms.uStrike!.value as { x: number; y: number; z: number };
    const sl = Math.hypot(sd.x, sd.y, sd.z);
    sd.x /= sl; sd.y /= sl; sd.z /= sl;
    oceanMat.uniforms.uStrikePos!.value = {
      x: origin.x,
      y: 70,
      z: origin.z,
    };
    // precomputed flicker pattern (unused under reduced motion)
    const flicker = Array.from({ length: 8 }, () => 0.35 + rng() * 0.65);
    bolts.push({
      meshes,
      born: clock,
      life: 0.14 + rng() * 0.14,
      intensity,
      flicker,
    });
    const e: LightningEvent = {
      intensity: capFlashIntensity(intensity, reducedMotion),
      side: boltSide(origin.x),
      distance: Math.hypot(origin.x, origin.z),
    };
    for (const cb of listeners) cb(e);
  }

  function flashLevel(): number {
    let f = 0;
    for (const b of bolts) {
      const age = clock - b.born;
      if (age < 0 || age > b.life) continue;
      const ph = age / b.life;
      const flick = reducedMotion
        ? 1
        : (b.flicker[Math.floor(ph * b.flicker.length) % b.flicker.length] ??
          1);
      const env = Math.sin(Math.PI * Math.min(1, ph));
      f = Math.max(f, env * flick * b.intensity);
    }
    return capFlashIntensity(f, reducedMotion);
  }

  function pruneBolts() {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      if (b && clock - b.born > b.life + 0.05) {
        for (const m of b.meshes) {
          scene.remove(m);
          m.geometry.dispose();
          (m.material as MeshBasicMaterial).dispose();
        }
        bolts.splice(i, 1);
      }
    }
  }

  // --- frame probe: drop to Low under 45 fps after ~1 s ---
  let probeFrames = 0;
  let probeStart = 0;
  let probed = false;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  applyQuality(quality);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;

    // strike scheduling (postponed if the photosafety limiter is saturated)
    if (clock >= nextStrikeAt) {
      if (limiter.tryFlash(now)) {
        strike();
        // occasional double strike
        nextStrikeAt = clock + (rng() < 0.3 && !reducedMotion
          ? 0.15 + rng() * 0.15
          : debugStrike
            ? 4
            : 4 + rng() * 7);
      } else {
        nextStrikeAt = clock + 0.5;
      }
    }

    const flash = flashLevel();
    oceanMat.uniforms.uTime!.value = clock;
    oceanMat.uniforms.uFlash!.value = flash;
    skyMat.uniforms.uTime!.value = clock;
    skyMat.uniforms.uFlash!.value = flash * 0.8;
    // global light lift stays small — the flash must not flatten the scene
    moon.intensity = 0.4 + flash * 0.7;
    ambient.intensity = 0.55 + flash * 0.15;
    tickRain(rain, clock);

    // camera rides the swell — low over the water, tilted a touch down
    const bob = reducedMotion ? 0 : waveHeight(0, CAM_Z, clock, STORM_WAVES) * 0.3;
    const slope = reducedMotion
      ? { sx: 0, sz: 0 }
      : waveSlope(0, CAM_Z, clock, STORM_WAVES);
    camera.position.y = CAM_Y + bob;
    camera.rotation.z = slope.sx * 0.04;
    camera.rotation.x = -0.055 + slope.sz * 0.02;

    // the distant ship rides the same waves; lantern swings
    ship.position.y = waveHeight(150, -320, clock, STORM_WAVES) * 0.4 - 0.3;
    ship.rotation.z = Math.sin(clock * 0.5) * 0.06;
    lantern.position.x = Math.sin(clock * 1.9) * 0.8;
    lantern.intensity = 30 + flash * 200;

    for (const b of bolts) {
      const age = clock - b.born;
      const ph = Math.min(1, Math.max(0, age / b.life));
      const base = reducedMotion
        ? 1 - ph
        : (b.flicker[Math.floor(ph * b.flicker.length) % b.flicker.length] ??
          1) * (1 - ph * 0.5);
      for (const m of b.meshes) {
        const mat = m.material as MeshBasicMaterial;
        mat.opacity = Math.max(0, base * (m.userData.baseOpacity as number));
      }
    }
    pruneBolts();

    // quality probe
    if (!probed) {
      if (probeFrames === 0) probeStart = now;
      probeFrames++;
      if (now - probeStart > 1000) {
        probed = true;
        const fps = probeFrames / ((now - probeStart) / 1000);
        if (fps < 45 && quality === "high") applyQuality("low");
      }
    }

    // always through the composer — OutputPass does the one and only
    // linear→sRGB conversion; Low just skips the bloom pass
    bloom.enabled = useBloom;
    composer.render();
  });

  return {
    setQuality: applyQuality,
    setReducedMotion(on: boolean) {
      reducedMotion = on;
    },
    onLightning(cb) {
      listeners.push(cb);
    },
    strike,
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      composer.dispose();
      renderer.dispose();
    },
  };
}
