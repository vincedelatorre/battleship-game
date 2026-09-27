import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Path,
  Plane,
  PlaneGeometry,
  Points,
  PointsMaterial,
  PMREMGenerator,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Object3D,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { Sky } from "three/addons/objects/Sky.js";
import type { Coord, Placement, Shot } from "../../engine/types";
import { shipCells } from "../../engine/placement";
import { waveHeight } from "../storm/waves";
import { createBoardOcean, BOARD_WAVES } from "./ocean";
import { plaqueTexture, puffTexture } from "./textures";
import { CELL, cellToWorld, gridBounds, worldToCell } from "./layout";
import { createShip, placeShipObject, loadShipManifest, type FleetColor } from "./ships";

export interface BoardView {
  setReticle(cell: Coord | null): void;
  shakeReticle(): void;
  /** side = whose water was hit: 'enemy' = our shot landed on their grid */
  applyShot(side: "enemy" | "player", shot: Shot): void;
  revealShip(p: Placement): void;
  setOwnFleet(placements: readonly Placement[]): void;
  /** debug: tint every engine-occupied cell so sprite alignment is checkable */
  showCells(): void;
  focus(which: "own" | "enemy" | "all"): void;
  dispose(): void;
  onHover(cb: (cell: Coord | null) => void): void;
  onFire(cb: (cell: Coord) => void): void;
}

const SUN_DIR = new Vector3(0.55, Math.tan((25 * Math.PI) / 180), -0.35).normalize();
const WAVES = BOARD_WAVES;

interface FxParticle {
  obj: Points | Sprite | Mesh;
  born: number;
  life: number;
  vel?: Float32Array;
  kind: "splash" | "flash" | "smoke" | "fire";
  base?: Vector3;
}

export async function createBoardScene(canvas: HTMLCanvasElement): Promise<
  BoardView & { renderer: WebGLRenderer }
> {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;

  const scene = new Scene();
  scene.fog = new FogExp2(new Color(0.10, 0.15, 0.18).convertSRGBToLinear(), 0.0016);

  const camera = new PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight || 16 / 9,
    0.5,
    2500,
  );

  // --- late-afternoon sun: three Sky + PMREM env + key light ---
  const sky = new Sky();
  sky.scale.setScalar(2000);
  const skyU = sky.material.uniforms;
  skyU.turbidity!.value = 6;
  skyU.rayleigh!.value = 1.6;
  skyU.mieCoefficient!.value = 0.004;
  skyU.mieDirectionalG!.value = 0.85;
  skyU.sunPosition!.value = SUN_DIR.clone();
  scene.add(sky);

  const pmrem = new PMREMGenerator(renderer);
  {
    const skyOnly = new Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(2000);
    const u = skyCopy.material.uniforms;
    u.turbidity!.value = 6;
    u.rayleigh!.value = 1.6;
    u.mieCoefficient!.value = 0.004;
    u.mieDirectionalG!.value = 0.85;
    u.sunPosition!.value = SUN_DIR.clone();
    skyOnly.add(skyCopy);
    scene.environment = pmrem.fromScene(skyOnly).texture;
  }

  const sun = new DirectionalLight(0xfff2d8, 3.4);
  sun.position.copy(SUN_DIR).multiplyScalar(160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = 70;
  Object.assign(sun.shadow.camera, {
    left: -sc, right: sc, top: sc, bottom: -sc, near: 20, far: 320,
  });
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // --- ocean ---
  const ocean = createBoardOcean();
  const oceanMat = ocean.material as {
    uniforms: Record<string, { value: unknown }>;
  };
  (oceanMat.uniforms.uSunDir!.value as Vector3).copy(SUN_DIR);
  // horizon haze sampled off the sky at the horizon: warm pale teal
  const haze = new Color(0.34, 0.46, 0.50).convertSRGBToLinear();
  (oceanMat.uniforms.uHazeColor!.value as Vector3).set(haze.r, haze.g, haze.b);
  const skyTint = new Color(0.22, 0.34, 0.42).convertSRGBToLinear();
  (oceanMat.uniforms.uSkyColor!.value as Vector3).set(skyTint.r, skyTint.g, skyTint.b);
  scene.add(ocean);

  // --- camera state: steep tactical view, slight perspective ---
  const cam = {
    target: new Vector3(0, 0, 0),
    dist: 82,
    pitch: (76 * Math.PI) / 180,
    yaw: 0,
    drift: 0,
    lastInput: -1e9,
  };
  function applyCamera() {
    const p = cam.pitch;
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * Math.cos(p) * cam.dist,
      cam.target.y + Math.sin(p) * cam.dist,
      cam.target.z + Math.cos(cam.yaw) * Math.cos(p) * cam.dist,
    );
    camera.lookAt(cam.target);
  }

  // --- markers: buoy + plaque sprite per row/col ---
  const markers: { sprite: Sprite; buoy: Mesh; x: number; z: number }[] = [];
  {
    const buoyGeo = new CylinderGeometry(0.55, 0.7, 0.7, 10);
    const buoyMat = new MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.9 });
    const rows = "ABCDEFGHIJ";
    const mk = (label: string, x: number, z: number) => {
      const sp = new Sprite(
        new SpriteMaterial({ map: plaqueTexture(label), transparent: true }),
      );
      sp.scale.set(2.4, 2.4, 1);
      sp.center.set(0.5, 0.1); // plaque sits above the buoy
      const buoy = new Mesh(buoyGeo, buoyMat);
      buoy.castShadow = true;
      scene.add(buoy, sp);
      markers.push({ sprite: sp, buoy, x, z });
    };
    for (const g of ["player", "enemy"] as const) {
      const b = gridBounds(g);
      for (let r = 0; r < 10; r++) {
        const z = b.minZ + r * CELL + CELL / 2;
        mk(rows[r]!, b.minX - 3.4, z); // rows along the left edge
      }
      for (let c = 0; c < 10; c++) {
        const x = b.minX + c * CELL + CELL / 2;
        mk(String(c + 1), x, b.maxZ + 3.2); // cols along the near-camera edge
      }
    }
  }

  // --- reticle: brass ring riding the hovered enemy cell ---
  const reticle = new Mesh(
    new TorusGeometry(1.65, 0.1, 10, 40),
    new MeshStandardMaterial({
      color: 0xc9a35f,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0x3a2a10,
    }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  scene.add(reticle);
  let reticleCell: Coord | null = null;
  let reticleShake = 0;

  // --- shot markers: white rings (miss) and red X's (hit) ---
  const shotMarkers: { obj: Object3D; x: number; z: number }[] = [];
  const ringGeo = new TorusGeometry(1.5, 0.09, 8, 32);
  const ringMat = new MeshStandardMaterial({ color: 0xe8e4d4, roughness: 0.6 });
  const xMat = new MeshStandardMaterial({
    color: 0xb8281e,
    roughness: 0.5,
    emissive: 0x551008,
  });
  function addShotMarker(x: number, z: number, hit: boolean) {
    let obj: Object3D;
    if (hit) {
      const g = new Group();
      const bar = new BoxGeometry(2.6, 0.16, 0.5);
      const a = new Mesh(bar, xMat);
      const b2 = new Mesh(bar, xMat);
      a.rotation.y = Math.PI / 4;
      b2.rotation.y = -Math.PI / 4;
      g.add(a, b2);
      obj = g;
    } else {
      obj = new Mesh(ringGeo, ringMat);
      obj.rotation.x = -Math.PI / 2;
    }
    obj.position.set(x, 0.4, z);
    scene.add(obj);
    shotMarkers.push({ obj, x, z });
  }

  // --- ships ---
  const manifest = await loadShipManifest();
  const ships: {
    obj: Object3D;
    placement: Placement;
    cells: { c: Coord; x: number; z: number }[];
    side: "player" | "enemy";
    sinking: number; // 0 = afloat, >0 = sinking progress
    sway: number; // phase offset
  }[] = [];

  // --- debug cell tint quads + wreck glow (one per occupied cell) ---
  const tintGeo = new PlaneGeometry(3.6, 3.6);
  tintGeo.rotateX(-Math.PI / 2);
  // thin ring outlining an engine cell (~2px on screen at default zoom)
  const ringShape = new Shape();
  const ro = CELL * 0.49, ri = CELL * 0.49 - 0.18;
  ringShape.moveTo(-ro, -ro);
  ringShape.lineTo(ro, -ro);
  ringShape.lineTo(ro, ro);
  ringShape.lineTo(-ro, ro);
  ringShape.closePath();
  const ringHole = new Path();
  ringHole.moveTo(-ri, -ri);
  ringHole.lineTo(-ri, ri);
  ringHole.lineTo(ri, ri);
  ringHole.lineTo(ri, -ri);
  ringHole.closePath();
  ringShape.holes.push(ringHole);
  const cellRingGeo = new ShapeGeometry(ringShape);
  cellRingGeo.rotateX(-Math.PI / 2);
  const ringQuads: { m: Mesh; x: number; z: number }[] = [];
  const SHIP_TINTS = [0x51d0a0, 0xe8b23a, 0x9a6ae0, 0x4fa8e0, 0xe06a4f];
  const tintQuads: { m: Mesh; x: number; z: number }[] = [];
  let cellsShown = false;
  function addCellTints(
    p: Placement,
    grid: "player" | "enemy",
    color: number,
    opacity: number,
  ) {
    for (const c of shipCells(p)) {
      const w = cellToWorld(grid, c);
      const m = new Mesh(
        tintGeo,
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          depthTest: false, // full squares, never clipped by the swell
        }),
      );
      m.position.set(w.x, 0.3, w.z);
      m.renderOrder = -0.5;
      scene.add(m);
      tintQuads.push({ m, x: w.x, z: w.z });
      const r = new Mesh(
        cellRingGeo,
        new MeshBasicMaterial({
          color,
          transparent: true,
          opacity: Math.min(1, opacity * 3),
          depthWrite: false,
          depthTest: false,
        }),
      );
      r.position.set(w.x, 0.32, w.z);
      r.renderOrder = 11; // outlines draw over sprites and water
      scene.add(r);
      ringQuads.push({ m: r, x: w.x, z: w.z });
    }
  }

  function addShip(p: Placement, side: "player" | "enemy", color: FleetColor) {
    const meta = manifest[`${color}/${p.id}`];
    if (!meta) throw new Error(`no sprite for ${color}/${p.id}`);
    const obj = createShip(p.id, color, meta);
    placeShipObject(obj, side === "player" ? "player" : "enemy", p);
    scene.add(obj);
    const cells = shipCells(p).map((c) => ({
      c,
      ...cellToWorld(side === "player" ? "player" : "enemy", c),
    }));
    ships.push({ obj, placement: p, cells, side, sinking: 0, sway: ships.length * 1.7 });
    if (cellsShown) {
      addCellTints(p, side, SHIP_TINTS[ships.length % SHIP_TINTS.length]!, 0.28);
    }
    updateHullUniforms();
  }

  function updateHullUniforms() {
    const pos = oceanMat.uniforms.uHullPos!.value as Vector4[];
    const size = oceanMat.uniforms.uHullSize!.value as Vector4[];
    let i = 0;
    for (const s of ships) {
      if (i >= 12) break;
      const yaw = s.obj.userData.yaw as number;
      const hl = (s.obj.userData.hullLen as number) / 2;
      const hb = (s.obj.userData.beam as number) / 2;
      pos[i]!.set(s.obj.position.x, s.obj.position.z, Math.cos(yaw), -Math.sin(yaw));
      size[i]!.set(hl, hb, 0, 0);
      i++;
    }
    oceanMat.uniforms.uHullCount!.value = i;
  }

  // --- particles / effects ---
  const puff = puffTexture();
  const fx: FxParticle[] = [];

  function spawnSplash(x: number, z: number) {
    const n = 42;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.8;
      pos.set([x + Math.cos(a) * r, 0.3, z + Math.sin(a) * r], i * 3);
      const up = 5 + Math.random() * 7;
      const out = 1 + Math.random() * 2.4;
      vel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    const pts = new Points(
      geo,
      new PointsMaterial({
        map: puff,
        color: 0xdff2f4,
        size: 0.9,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    scene.add(pts);
    fx.push({ obj: pts, born: clock, life: 0.9, vel, kind: "splash" });
  }

  function spawnFlash(x: number, z: number) {
    const m = new SpriteMaterial({
      map: puff,
      color: 0xffb545,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const sp = new Sprite(m);
    sp.position.set(x, 1.6, z);
    sp.scale.set(1.5, 1.5, 1);
    scene.add(sp);
    fx.push({ obj: sp, born: clock, life: 0.45, kind: "flash" });
    for (let i = 0; i < 3; i++) {
      const sm = new SpriteMaterial({
        map: puff,
        color: 0x2a2a2a,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const s2 = new Sprite(sm);
      s2.position.set(x + (Math.random() - 0.5), 2 + i, z + (Math.random() - 0.5));
      s2.scale.set(2, 2, 1);
      scene.add(s2);
      fx.push({
        obj: s2,
        born: clock + i * 0.08,
        life: 3.6,
        kind: "smoke",
        base: s2.position.clone(),
      });
    }
  }

  const fires: { sp: Sprite; x: number; z: number; ph: number }[] = [];
  function spawnFire(x: number, z: number) {
    const m = new SpriteMaterial({
      map: puff,
      color: 0xff7a20,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const sp = new Sprite(m);
    sp.position.set(x, 1.0, z);
    sp.scale.set(1.6, 1.6, 1);
    scene.add(sp);
    fires.push({ sp, x, z, ph: Math.random() * 10 });
  }

  // --- input: hover + click on enemy waters ---
  const ray = new Raycaster();
  const ndc = new Vector2();
  const planeY = new Plane(new Vector3(0, 1, 0), 0);
  const hitPt = new Vector3();
  let hoverCb: (c: Coord | null) => void = () => {};
  let fireCb: (c: Coord) => void = () => {};

  function pick(ev: PointerEvent | MouseEvent): Coord | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(planeY, hitPt)) return null;
    return worldToCell("enemy", hitPt.x, hitPt.z);
  }

  let panning = false;
  let panStart: { x: number; y: number; tx: number; tz: number } | null = null;
  canvas.addEventListener("pointermove", (ev) => {
    cam.lastInput = performance.now();
    if (panning && panStart) {
      const r = canvas.getBoundingClientRect();
      const wppx = (2 * cam.dist * Math.tan((camera.fov * Math.PI) / 360)) / r.height;
      cam.target.x = clamp(panStart.tx - (ev.clientX - panStart.x) * wppx, -52, 52);
      cam.target.z = clamp(panStart.tz - (-(ev.clientY - panStart.y)) * wppx * -1, -30, 30);
      return;
    }
    hoverCb(pick(ev));
  });
  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.button === 2 || ev.button === 1) {
      panning = true;
      panStart = { x: ev.clientX, y: ev.clientY, tx: cam.target.x, tz: cam.target.z };
      canvas.setPointerCapture(ev.pointerId);
    }
  });
  canvas.addEventListener("pointerup", (ev) => {
    if (panning) {
      panning = false;
      panStart = null;
      canvas.releasePointerCapture(ev.pointerId);
      return;
    }
    if (ev.button === 0) {
      const c = pick(ev);
      if (c) fireCb(c);
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    cam.lastInput = performance.now();
    userZoomed = true;
    if (ev.shiftKey) {
      cam.pitch = clamp(
        cam.pitch - ev.deltaY * 0.0012,
        (55 * Math.PI) / 180,
        (85 * Math.PI) / 180,
      );
    } else {
      cam.dist = clamp(cam.dist * (1 + ev.deltaY * 0.001), 42, 150);
    }
  }, { passive: false });

  function clamp(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
  }

  // --- render loop ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  let clock = 0;
  let last = performance.now();
  let userZoomed = false;
  function fitDist(): number {
    const aspect = camera.aspect || 1.6;
    // landscape: width is binding (grids span ~96u along x)
    // portrait: yawed 90°, the same span runs along the view depth
    return aspect >= 1 ? 82 : 128 * clamp(0.62 / aspect, 1, 1.7);
  }
  const hoverUniform = oceanMat.uniforms.uHover!.value as Vector4;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cam.yaw = w / h < 1 ? -Math.PI / 2 : 0;
    if (!userZoomed) cam.dist = fitDist();
  }
  window.addEventListener("resize", resize);
  resize();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    oceanMat.uniforms.uTime!.value = clock;

    // idle drift: slow sway when nobody has touched the camera lately
    if (now - cam.lastInput > 4000) {
      cam.drift += dt * 0.12;
      cam.target.x += Math.cos(cam.drift) * 0.0022;
      cam.target.z += Math.sin(cam.drift * 0.7) * 0.0018;
      cam.target.x = clamp(cam.target.x, -52, 52);
      cam.target.z = clamp(cam.target.z, -30, 30);
    }
    applyCamera();

    // markers bob on the swell
    for (const m of markers) {
      const hgt = waveHeight(m.x, m.z, clock, WAVES);
      m.buoy.position.set(m.x, hgt + 0.15, m.z);
      m.buoy.rotation.z = waveHeight(m.x + 1, m.z, clock, WAVES) - hgt;
      m.buoy.rotation.x = hgt - waveHeight(m.x, m.z + 1, clock, WAVES);
      m.sprite.position.set(m.x, hgt + 1.5, m.z);
    }

    // ships ride the swell: heave + pitch + roll + a slow independent sway
    for (const s of ships) {
      const o = s.obj;
      const hl = (o.userData.hullLen as number) / 2;
      const yaw = o.userData.yaw as number;
      const fw = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const sd = { x: -fw.z, z: fw.x };
      const cx = o.position.x;
      const cz = o.position.z;
      const hC = waveHeight(cx, cz, clock, WAVES);
      const hB = waveHeight(cx + fw.x * hl, cz + fw.z * hl, clock, WAVES);
      const hS = waveHeight(cx - fw.x * hl, cz - fw.z * hl, clock, WAVES);
      const hP = waveHeight(cx + sd.x * 1.8, cz + sd.z * 1.8, clock, WAVES);
      const hQ = waveHeight(cx - sd.x * 1.8, cz - sd.z * 1.8, clock, WAVES);
      if (s.sinking > 0 && s.sinking < 1) s.sinking = Math.min(1, s.sinking + dt * 0.35);
      const sink = s.sinking;
      const pitch = clamp(Math.atan2(hB - hS, hl * 2), -0.105, 0.105);
      const roll = clamp(Math.atan2(hP - hQ, 3.6), -0.14, 0.14);
      const swayYaw = Math.sin(clock * 0.21 + s.sway) * 0.026;
      o.position.y = hC * 0.55 + 0.02 - sink * 0.3;
      o.rotation.y = yaw + swayYaw;
      o.rotation.x = pitch;
      o.rotation.z = roll + sink * 0.42;
      const sprite = o.userData.sprite as Mesh;
      const mat = sprite.material as MeshBasicMaterial;
      mat.opacity = 1 - sink * 0.15;
      mat.color.setScalar(1 - sink * 0.35);
      if (sink > 0 && !mat.userData.wreck) {
        mat.userData.wreck = true; // wreck floats: draw over water + markers
        mat.depthTest = false;
        mat.needsUpdate = true;
        sprite.renderOrder = 10;
      }
      (o.userData.blob as Mesh).visible = sink < 0.8;
    }

    // reticle rides the swell
    if (reticleCell) {
      const w = cellToWorld("enemy", reticleCell);
      const hgt = waveHeight(w.x, w.z, clock, WAVES);
      const shake = reticleShake > 0 ? Math.sin(reticleShake * 60) * reticleShake * 0.5 : 0;
      reticle.position.set(w.x + shake, hgt + 0.55, w.z);
      reticle.visible = true;
      reticleShake = Math.max(0, reticleShake - dt);
      hoverUniform.x = w.x;
      hoverUniform.y = w.z;
      hoverUniform.z = 1;
    } else {
      reticle.visible = false;
      hoverUniform.z = 0;
    }

    // debug cell tints / wreck glow / outlines ride the swell
    for (const t of tintQuads) {
      t.m.position.y = waveHeight(t.x, t.z, clock, WAVES) + 0.12;
    }
    for (const t of ringQuads) {
      t.m.position.y = waveHeight(t.x, t.z, clock, WAVES) + 0.16;
    }

    // shot markers bob
    for (const m of shotMarkers) {
      m.obj.position.y = waveHeight(m.x, m.z, clock, WAVES) + 0.42;
    }

    // particles
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i]!;
      const age = clock - p.born;
      if (age < 0) continue;
      const t = age / p.life;
      if (t >= 1) {
        scene.remove(p.obj);
        const m2 = p.obj as Points | Sprite | Mesh;
        if ("material" in m2) (m2.material as PointsMaterial | SpriteMaterial).dispose();
        fx.splice(i, 1);
        continue;
      }
      if (p.kind === "splash") {
        const attr = (p.obj as Points).geometry.getAttribute("position");
        const arr = attr.array as Float32Array;
        const v = p.vel!;
        for (let j = 0; j < arr.length; j += 3) {
          arr[j] = arr[j]! + v[j]! * dt;
          arr[j + 1] = arr[j + 1]! + (v[j + 1]! - 9.8 * age) * dt;
          arr[j + 2] = arr[j + 2]! + v[j + 2]! * dt;
        }
        attr.needsUpdate = true;
        ((p.obj as Points).material as PointsMaterial).opacity = 0.95 * (1 - t);
      } else if (p.kind === "flash") {
        const s = 1.5 + t * 8;
        (p.obj as Sprite).scale.set(s, s, 1);
        ((p.obj as Sprite).material as SpriteMaterial).opacity = 0.9 * (1 - t);
      } else if (p.kind === "smoke") {
        const s = p.obj as Sprite;
        s.position.y = p.base!.y + age * 1.6;
        const sc2 = 2 + t * 4;
        s.scale.set(sc2, sc2, 1);
        (s.material as SpriteMaterial).opacity = 0.5 * (1 - t);
      }
    }

    // persistent fires flicker
    for (const f of fires) {
      const s = 1.3 + Math.sin(clock * 11 + f.ph) * 0.35;
      f.sp.scale.set(s, s * 1.2, 1);
      f.sp.position.y = waveHeight(f.x, f.z, clock, WAVES) + 1.0;
    }

    composer.render();
  });

  const view: BoardView & { renderer: WebGLRenderer } = {
    renderer,
    setReticle(cell) {
      reticleCell = cell;
    },
    shakeReticle() {
      reticleShake = 0.35;
    },
    applyShot(side, shot) {
      const grid = side === "enemy" ? "enemy" : "player";
      const w = cellToWorld(grid, shot.coord);
      if (shot.result === "miss") {
        spawnSplash(w.x, w.z);
        addShotMarker(w.x, w.z, false);
      } else {
        spawnFlash(w.x, w.z);
        spawnSplash(w.x, w.z);
        addShotMarker(w.x, w.z, true);
        if (side === "player") spawnFire(w.x, w.z); // our ship burns
        else spawnFire(w.x, w.z);                 // burning water over their hull
        if (shot.result === "sunk" && side === "player") {
          const s = ships.find(
            (sh) =>
              sh.side === "player" &&
              sh.cells.some((cc) => cc.c.row === shot.coord.row && cc.c.col === shot.coord.col),
          );
          if (s) {
            s.sinking = 0.001; // starts the sink anim
            addCellTints(s.placement, "player", 0xd83a20, 0.22);
          }
        }
      }
    },
    revealShip(p) {
      const enemyColor = aiColor;
      addShip(p, "enemy", enemyColor);
      const s = ships[ships.length - 1]!;
      s.sinking = 0.001;
      addCellTints(p, "enemy", 0xd83a20, 0.25); // red glow on the wreck's cells
      const mid = s.cells[Math.floor(s.cells.length / 2)]!;
      spawnFire(mid.x, mid.z);
      spawnFlash(mid.x, mid.z);
    },
    setOwnFleet(placements) {
      for (const p of placements) addShip(p, "player", ownColor);
    },
    showCells() {
      cellsShown = true;
      for (const s of ships) {
        addCellTints(s.placement, s.side, SHIP_TINTS[ships.indexOf(s) % SHIP_TINTS.length]!, 0.28);
      }
    },
    focus(which) {
      if (which === "own") {
        cam.target.set(-24, 0, 0);
        cam.dist = 62;
      } else if (which === "enemy") {
        cam.target.set(24, 0, 0);
        cam.dist = 62;
      } else {
        cam.target.set(0, 0, 0);
        cam.dist = fitDist();
        userZoomed = false;
      }
      cam.lastInput = performance.now();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      composer.dispose();
      renderer.dispose();
    },
    onHover(cb) {
      hoverCb = cb;
    },
    onFire(cb) {
      fireCb = cb;
    },
  };

  // fleet colours: player is blue until captain select; AI picks another
  let ownColor: FleetColor = "blue";
  let aiColor: FleetColor = "red";
  function setFleetColors(own: FleetColor, ai: FleetColor) {
    ownColor = own;
    aiColor = ai;
  }
  (view as unknown as { setFleetColors: typeof setFleetColors }).setFleetColors =
    setFleetColors;

  return view;
}
