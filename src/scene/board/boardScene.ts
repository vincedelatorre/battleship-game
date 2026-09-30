import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CanvasTexture,
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
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
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
import type { ShipId } from "../../engine/rules";
import { shipCells } from "../../engine/placement";
import { waveHeight } from "../storm/waves";
import { createBoardOcean, BOARD_WAVES } from "./ocean";
import { puffTexture } from "./textures";
import { glyphLabelCanvas, glyphMeta, loadGlyphs } from "../../glyphs";
import {
  CELL,
  cellToWorld,
  getBoardLayout,
  GRID_SIZE,
  gridBounds,
  gridCenterX,
  gridCenterZ,
  setBoardLayout,
  SHIP_FLOAT_H,
  SHIP_PITCH_MAX,
  SHIP_ROLL_MAX,
  SHIP_SWAY_MAX,
  worldToCell,
  type GridId,
} from "./layout";
import { createShip, placeShipObject, loadShipManifest, type FleetColor } from "./ships";

/** valid/invalid = placement ghost; target = picked/aimed square; scout = lookout box. */
export type PreviewTone = "valid" | "invalid" | "target" | "scout";
export interface PreviewTile {
  readonly cell: Coord;
  readonly tone: PreviewTone;
}

export interface BoardView {
  setReticle(cell: Coord | null): void;
  shakeReticle(): void;
  /** side = whose water was hit: 'enemy' = our shot landed on their grid */
  applyShot(side: "enemy" | "player", shot: Shot): void;
  revealShip(p: Placement): void;
  /** Replaces the whole own fleet (placement re-renders on every change). */
  setOwnFleet(placements: readonly Placement[]): void;
  setFleetColors(own: FleetColor, ai: FleetColor): void;
  /** Square highlights, flat on the grid plane so they sit exactly in their squares. */
  setPreview(grid: GridId, tiles: readonly PreviewTile[]): void;
  /** Translucent ship hull at a snapped berth (placement / Ghost Ship). */
  setGhost(p: Placement | null, valid?: boolean): void;
  /** Dim veil over the enemy waters while we deploy our fleet. */
  setEnemyFog(visible: boolean): void;
  /** Ghost Ship: our ship sails from one berth to another. */
  moveOwnShip(from: Placement, to: Placement): void;
  /** Their ship escaped: our old hits on it go cold. */
  enemyRelocated(shipId: ShipId): void;
  /** Crow's Nest report: 3×3 box + count, on the scouted grid. */
  scout(center: Coord, count: number, by: 0 | 1): void;
  /** debug: tint every engine-occupied cell so sprite alignment is checkable */
  showCells(): void;
  focus(which: "own" | "enemy" | "all"): void;
  /** debug: force a camera pitch/distance for verification shots */
  pitchAt(deg: number, dist?: number): void;
  /** debug: dump ship render state */
  inspectShips(): unknown[];
  /** debug: project a world point to screen px */
  project(wx: number, wy: number, wz: number): { x: number; y: number };
  dispose(): void;
  onHover(cb: (cell: Coord | null, grid: GridId | null) => void): void;
  onFire(cb: (cell: Coord, grid: GridId) => void): void;
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
  await loadGlyphs(); // pirate-letter legends
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;

  const scene = new Scene();
  scene.fog = new FogExp2(new Color(0.56, 0.70, 0.85).convertSRGBToLinear(), 0.0016); // #8fb3d9

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
  const haze = new Color(0.56, 0.70, 0.85).convertSRGBToLinear(); // #8fb3d9
  (oceanMat.uniforms.uHazeColor!.value as Vector3).set(haze.r, haze.g, haze.b);
  const skyTint = new Color(0.435, 0.612, 0.784).convertSRGBToLinear(); // #6f9cc8
  (oceanMat.uniforms.uSkyColor!.value as Vector3).set(skyTint.r, skyTint.g, skyTint.b);
  scene.add(ocean);

  // --- static grid overlay: crisp lines + cell border + hover fill ---
  // Flat planes just above the water mean: lines never ride the swell.
  const GRID_VERT = /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }`;
  const GRID_FRAG = /* glsl */ `
    precision highp float;
    uniform vec2 uMin;            // grid min x/z
    uniform vec3 uHoverCell;      // (col, row, on) in cell indices
    varying vec3 vWorld;
    void main() {
      vec2 q = vWorld.xz - uMin;                       // 0..GRID_SIZE local
      vec2 fq = abs(fract(q / ${CELL}.0 + 0.5) - 0.5) * ${CELL}.0; // dist to nearest line
      float dl = min(fq.x, fq.y);
      float aa = fwidth(dl) + 1e-4;
      float line = 1.0 - smoothstep(0.03, 0.03 + aa * 1.7, dl);
      float de = min(min(q.x, ${GRID_SIZE}.0 - q.x), min(q.y, ${GRID_SIZE}.0 - q.y));
      float border = 1.0 - smoothstep(0.05, 0.05 + aa * 1.8, abs(de));
      vec3 col = vec3(0.66, 0.74, 0.84);         // cool white
      float a = line * 0.34 + border * 0.8;
      if (uHoverCell.z > 0.5) {
        vec2 cc = (uHoverCell.xy + 0.5) * ${CELL}.0;
        float inside = (1.0 - step(${CELL / 2}.0, abs(q.x - cc.x)))
                     * (1.0 - step(${CELL / 2}.0, abs(q.y - cc.y)));
        a = max(a, inside * 0.16);
        float hb = min(abs(q.x - cc.x), abs(q.y - cc.y));
        a = max(a, inside * (1.0 - smoothstep(1.62, 1.9, hb)) * 0.35);
      }
      gl_FragColor = vec4(col, a); // OutputPass converts
    }`;
  const gridOverlays: Record<
    string,
    { mesh: Mesh; uniforms: Record<string, { value: unknown }> }
  > = {};
  for (const g of ["player", "enemy"] as const) {
    const bounds = gridBounds(g);
    const gm = new ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uMin: { value: new Vector2(bounds.minX, bounds.minZ) },
        uHoverCell: { value: new Vector3(0, 0, 0) },
      },
    });
    const gp = new Mesh(new PlaneGeometry(GRID_SIZE, GRID_SIZE), gm);
    gp.geometry.rotateX(-Math.PI / 2);
    gp.position.set(bounds.minX + GRID_SIZE / 2, 0.06, bounds.minZ + GRID_SIZE / 2);
    gp.renderOrder = 0.5; // above ocean, under shadows/ships
    scene.add(gp);
    gridOverlays[g] = { mesh: gp, uniforms: gm.uniforms as Record<string, { value: unknown }> };
  }
  const hoverCellU = gridOverlays.enemy!.uniforms.uHoverCell!.value as Vector3;

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

  // --- markers: gold pirate-letter plaques per row/col ---
  // letters down the left edge, numbers across the top (mockup reading)
  const markers: {
    sprite: Sprite;
    grid: GridId;
    axis: "row" | "col";
    i: number;
    x: number;
    z: number;
  }[] = [];
  {
    const rows = "ABCDEFGHIJ";
    const mk = (label: string, grid: GridId, axis: "row" | "col", i: number) => {
      const tex = new CanvasTexture(glyphLabelCanvas(label));
      tex.colorSpace = SRGBColorSpace;
      const meta = glyphMeta(label);
      const sp = new Sprite(new SpriteMaterial({ map: tex, transparent: true }));
      const hgt = 2.6;
      sp.scale.set((meta.w / meta.h) * hgt, hgt, 1);
      const rec = { sprite: sp, grid, axis, i, x: 0, z: 0 };
      legendPos(rec);
      sp.position.set(rec.x, 1.7, rec.z);
      scene.add(sp);
      markers.push(rec);
    };
    for (const g of ["player", "enemy"] as const) {
      for (let r = 0; r < 10; r++) mk(rows[r]!, g, "row", r);
      for (let c = 0; c < 10; c++) mk(String(c + 1), g, "col", c);
    }
  }
  /** letters down the left edge (minX), numbers across the top (minZ) */
  function legendPos(m: (typeof markers)[number]) {
    const b = gridBounds(m.grid);
    if (m.axis === "row") {
      m.x = b.minX - 3.4;
      m.z = b.minZ + m.i * CELL + CELL / 2;
    } else {
      m.x = b.minX + m.i * CELL + CELL / 2;
      m.z = b.minZ - 3.2;
    }
  }

  // --- reticle: brass ring riding the hovered enemy cell ---
  const reticle = new Mesh(
    new TorusGeometry(1.65, 0.1, 10, 40),
    new MeshStandardMaterial({
      color: 0xc9a35f,
      metalness: 0.8,
      transparent: true,
      depthTest: false,
      roughness: 0.3,
      emissive: 0x3a2a10,
    }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.renderOrder = 5;
  reticle.visible = false;
  scene.add(reticle);
  let reticleCell: Coord | null = null;
  let reticleShake = 0;

  // --- enemy fog: a dark veil over their waters during deployment ---
  const enemyFog = (() => {
    const eb = gridBounds("enemy");
    const m = new Mesh(
      new PlaneGeometry(eb.maxX - eb.minX + 8, eb.maxZ - eb.minZ + 8),
      new MeshBasicMaterial({
        color: new Color(0x0a1420),
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set((eb.minX + eb.maxX) / 2, 2.4, 0);
    m.renderOrder = 8;
    m.visible = false;
    scene.add(m);
    return m;
  })();

  // --- shot markers: white rings (miss) and red X's (hit) ---
  const shotMarkers: {
    obj: Object3D;
    grid: GridId;
    cell: Coord;
    x: number;
    z: number;
  }[] = [];
  const ringGeo = new TorusGeometry(1.5, 0.09, 8, 32);
  const ringMat = new MeshStandardMaterial({
    color: 0xe8e4d4,
    roughness: 0.6,
    transparent: true,
    depthTest: false,
  });
  const xMat = new MeshStandardMaterial({
    color: 0xb8281e,
    roughness: 0.5,
    emissive: 0x551008,
    transparent: true,
    depthTest: false,
  });
  const staleMat = new MeshStandardMaterial({
    color: 0x7d8790,
    roughness: 0.7,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
  });
  function addShotMarker(grid: GridId, cell: Coord, hit: boolean): Object3D {
    const w = cellToWorld(grid, cell);
    let obj: Object3D;
    if (hit) {
      const g = new Group();
      const bar = new BoxGeometry(2.6, 0.16, 0.5);
      const a = new Mesh(bar, xMat);
      const b2 = new Mesh(bar, xMat);
      a.renderOrder = b2.renderOrder = 5; // above depthTest-off ships
      a.rotation.y = Math.PI / 4;
      b2.rotation.y = -Math.PI / 4;
      g.add(a, b2);
      obj = g;
    } else {
      obj = new Mesh(ringGeo, ringMat);
      obj.rotation.x = -Math.PI / 2;
      obj.renderOrder = 5;
    }
    obj.position.set(w.x, 0.4, w.z);
    scene.add(obj);
    shotMarkers.push({ obj, grid, cell, x: w.x, z: w.z });
    return obj;
  }
  /** our hits on enemy ships, by ship — cooled when that ship escapes */
  const enemyHitMarks: {
    shipId: ShipId;
    obj: Object3D;
    grid: GridId;
    cell: Coord;
    x: number;
    z: number;
  }[] = [];

  // --- ships ---
  const manifest = await loadShipManifest();
  // fleet colours follow the captains (setFleetColors); blue/red until then
  let ownColor: FleetColor = "blue";
  let aiColor: FleetColor = "red";
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
  const ringQuads: { m: Mesh; grid: GridId; cell: Coord; x: number; z: number }[] = [];
  const SHIP_TINTS = [0x51d0a0, 0xe8b23a, 0x9a6ae0, 0x4fa8e0, 0xe06a4f];
  const tintQuads: { m: Mesh; grid: GridId; cell: Coord; x: number; z: number }[] = [];
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
      tintQuads.push({ m, grid, cell: c, x: w.x, z: w.z });
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
      ringQuads.push({ m: r, grid, cell: c, x: w.x, z: w.z });
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

  function disposeObject(obj: Object3D) {
    scene.remove(obj);
    obj.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose(); // textures are cached/shared
      }
    });
  }

  function removeShip(s: (typeof ships)[number]) {
    disposeObject(s.obj);
    ships.splice(ships.indexOf(s), 1);
    updateHullUniforms();
  }

  const samePlacement = (a: Placement, b: Placement) =>
    a.id === b.id && a.row === b.row && a.col === b.col && a.orientation === b.orientation;

  // --- ghost hull: translucent preview of a berth (placement / Ghost Ship) ---
  const ghosts = new Map<string, Object3D>();
  let ghost: Object3D | null = null;
  let ghostPlacement: Placement | null = null;
  function setGhost(p: Placement | null, valid = true) {
    if (ghost) ghost.visible = false;
    ghost = null;
    ghostPlacement = null;
    if (!p) return;
    const key = `${ownColor}/${p.id}`;
    let g = ghosts.get(key);
    if (!g) {
      const meta = manifest[key];
      if (!meta) return;
      g = createShip(p.id, ownColor, meta);
      const sm = (g.userData.sprite as Mesh).material as MeshStandardMaterial;
      sm.opacity = 0.62;
      sm.alphaTest = 0.05;
      (g.userData.blob as Mesh).visible = false;
      (g.userData.sprite as Mesh).renderOrder = 6;
      scene.add(g);
      ghosts.set(key, g);
    }
    placeShipObject(g, "player", p);
    const sm = (g.userData.sprite as Mesh).material as MeshStandardMaterial;
    sm.color.set(valid ? 0xffffff : 0xff6a50);
    g.visible = true;
    ghost = g;
    ghostPlacement = p;
  }

  // --- preview tiles: flat on the grid plane, exactly one square each ---
  const hatch = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 9;
    for (let i = -64; i <= 128; i += 22) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  })();
  const tileGeo = new PlaneGeometry(CELL * 0.94, CELL * 0.94);
  tileGeo.rotateX(-Math.PI / 2);
  const toneMats: Record<PreviewTone, { fill: MeshBasicMaterial; ring: MeshBasicMaterial }> = (() => {
    const mk = (fill: number, fo: number, ring: number, map?: CanvasTexture) => ({
      fill: new MeshBasicMaterial({
        color: fill, transparent: true, opacity: fo, depthWrite: false, depthTest: false,
        ...(map ? { map } : {}),
      }),
      ring: new MeshBasicMaterial({
        color: ring, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false,
      }),
    });
    return {
      valid: mk(0x4fbf7a, 0.34, 0x8ff0b0),
      invalid: mk(0xe0582a, 0.6, 0xff7a50, hatch),
      target: mk(0xe0c07f, 0.3, 0xffd97a),
      scout: mk(0x4fa8e0, 0.16, 0x8fd0ff),
    };
  })();
  const previewLayers: Record<
    string,
    { grid: GridId; tiles: readonly PreviewTile[]; meshes: Mesh[] }
  > = {};
  function setTiles(layer: string, grid: GridId, tiles: readonly PreviewTile[]) {
    for (const m of previewLayers[layer]?.meshes ?? []) scene.remove(m);
    const out: Mesh[] = [];
    for (const t of tiles) {
      const w = cellToWorld(grid, t.cell);
      const mats = toneMats[t.tone];
      const f = new Mesh(tileGeo, mats.fill);
      f.position.set(w.x, 0.08, w.z);
      f.renderOrder = 0.8; // over the grid lines, under hulls
      const r = new Mesh(cellRingGeo, mats.ring);
      r.position.set(w.x, 0.09, w.z);
      r.renderOrder = 0.9;
      scene.add(f, r);
      out.push(f, r);
    }
    previewLayers[layer] = { grid, tiles, meshes: out };
  }

  // --- Crow's Nest count badge, one per grid, floating over the box centre ---
  const badges: Record<
    string,
    { sp: Sprite; grid: GridId; cell: Coord; x: number; z: number }
  > = {};
  function countBadge(n: number): CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.fillStyle = "rgba(10,24,36,0.88)";
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = "#8fd0ff";
    g.stroke();
    g.fillStyle = "#f0e2b8";
    g.font = "bold 64px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 64, 68);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
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

  // fires persist — they carry a fractional grid position so a layout
  // switch (side ↔ stacked) can re-anchor them
  const fires: {
    sp: Sprite;
    grid: GridId;
    fx: number;
    fz: number;
    x: number;
    z: number;
    ph: number;
  }[] = [];
  function spawnFire(x: number, z: number) {
    const pb = gridBounds("player");
    const grid: GridId =
      x >= pb.minX && x <= pb.maxX && z >= pb.minZ && z <= pb.maxZ
        ? "player"
        : "enemy";
    const b = gridBounds(grid);
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
    fires.push({
      sp,
      grid,
      fx: (x - b.minX) / CELL,
      fz: (z - b.minZ) / CELL,
      x,
      z,
      ph: Math.random() * 10,
    });
  }

  // --- input: hover + click on enemy waters ---
  const ray = new Raycaster();
  const ndc = new Vector2();
  const planeY = new Plane(new Vector3(0, 1, 0), 0);
  const hitPt = new Vector3();
  let hoverCb: (c: Coord | null, g: GridId | null) => void = () => {};
  let fireCb: (c: Coord, g: GridId) => void = () => {};

  /** The square under the pointer on either grid (the flat grid plane, y=0). */
  function pick(ev: PointerEvent | MouseEvent): { cell: Coord; grid: GridId } | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(planeY, hitPt)) return null;
    for (const grid of ["enemy", "player"] as const) {
      const cell = worldToCell(grid, hitPt.x, hitPt.z);
      if (cell) return { cell, grid };
    }
    return null;
  }

  let panning = false;
  let panStart: { x: number; y: number; tx: number; tz: number } | null = null;
  canvas.addEventListener("pointermove", (ev) => {
    cam.lastInput = performance.now();
    if (panning && panStart) {
      const r = canvas.getBoundingClientRect();
      const wppx = (2 * cam.dist * Math.tan((camera.fov * Math.PI) / 360)) / r.height;
      cam.target.x = clamp(panStart.tx - (ev.clientX - panStart.x) * wppx, -panLimX(), panLimX());
      cam.target.z = clamp(panStart.tz - (-(ev.clientY - panStart.y)) * wppx * -1, -panLimZ(), panLimZ());
      return;
    }
    const p = pick(ev);
    hoverCb(p?.cell ?? null, p?.grid ?? null);
  });
  canvas.addEventListener("pointerleave", () => hoverCb(null, null));
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
      const p = pick(ev);
      if (p) fireCb(p.cell, p.grid);
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
  // panning range follows the long board axis of the active layout
  const panLimX = () => (getBoardLayout() === "stacked" ? 30 : 52);
  const panLimZ = () => (getBoardLayout() === "stacked" ? 52 : 30);

  // --- render loop ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  let clock = 0;
  let last = performance.now();
  let userZoomed = false;
  /** view height at distance 1 (vertical fov) */
  const viewK = () => 2 * Math.tan((camera.fov * Math.PI) / 360);
  /**
   * Which world layout shows the grids bigger at this aspect.
   * "side" spends ~110u across the view width (two 40u grids + 8u gap +
   * letter/number legends) and ~52u on height; "stacked" puts the same
   * ~104u span down the view height and needs ~56u of width.
   * Smaller required camera distance = bigger cells on screen.
   * Crossover lands just above square (~aspect 1.06).
   */
  function chooseLayout(aspect: number): "side" | "stacked" {
    const k = viewK();
    const side = Math.max(110 / (k * aspect), 52 / k);
    const stacked = Math.max(56 / (k * aspect), 104 / k);
    return stacked < side ? "stacked" : "side";
  }
  function fitDist(): number {
    const aspect = camera.aspect || 1.6;
    const k = viewK();
    // side: the ~110u combined span is width-bound; never closer than 82.
    // stacked: that span runs down the view height (enemy far, own near).
    return getBoardLayout() === "stacked"
      ? Math.max(82, 104 / k, 56 / (k * aspect))
      : Math.max(82, 110 / (k * aspect));
  }
  /** one grid + its legends (~56u square) fills the view */
  function fitOneDist(): number {
    const aspect = camera.aspect || 1.6;
    const k = viewK();
    return aspect >= 1 ? Math.max(58 / k, 60 / (k * aspect)) : Math.max(60 / k, 58 / (k * aspect));
  }

  /** re-anchor every world-placed object after a side↔stacked switch */
  function relayout() {
    for (const g of ["player", "enemy"] as const) {
      const b = gridBounds(g);
      const ov = gridOverlays[g]!;
      ov.mesh.position.set(b.minX + GRID_SIZE / 2, 0.06, b.minZ + GRID_SIZE / 2);
      (ov.uniforms.uMin!.value as Vector2).set(b.minX, b.minZ);
    }
    const eb = gridBounds("enemy");
    (oceanMat.uniforms.uGridB!.value as Vector2).set(eb.minX, eb.minZ);
    enemyFog.position.set((eb.minX + eb.maxX) / 2, 2.4, (eb.minZ + eb.maxZ) / 2);
    for (const m of markers) {
      legendPos(m);
      m.sprite.position.set(m.x, 1.7, m.z);
    }
    for (const s of ships) {
      placeShipObject(s.obj, s.side, s.placement);
      s.cells = shipCells(s.placement).map((c) => ({
        c,
        ...cellToWorld(s.side, c),
      }));
    }
    updateHullUniforms();
    for (const sm of shotMarkers) {
      const w = cellToWorld(sm.grid, sm.cell);
      sm.x = w.x;
      sm.z = w.z;
    }
    for (const hm of enemyHitMarks) {
      const w = cellToWorld(hm.grid, hm.cell);
      hm.x = w.x;
      hm.z = w.z;
    }
    for (const q of [...tintQuads, ...ringQuads]) {
      const w = cellToWorld(q.grid, q.cell);
      q.x = w.x;
      q.z = w.z;
      q.m.position.x = w.x;
      q.m.position.z = w.z;
    }
    for (const f of fires) {
      const b = gridBounds(f.grid);
      f.x = b.minX + f.fx * CELL;
      f.z = b.minZ + f.fz * CELL;
      f.sp.position.x = f.x;
      f.sp.position.z = f.z;
    }
    for (const [layer, rec] of Object.entries(previewLayers)) {
      setTiles(layer, rec.grid, rec.tiles);
    }
    for (const bd of Object.values(badges)) {
      const w = cellToWorld(bd.grid, bd.cell);
      bd.x = w.x;
      bd.z = w.z;
    }
    if (ghost && ghostPlacement) placeShipObject(ghost, "player", ghostPlacement);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const next = chooseLayout(w / h);
    if (next !== getBoardLayout()) {
      setBoardLayout(next);
      relayout();
    }
    if (!userZoomed) cam.dist = focused === "all" ? fitDist() : fitOneDist();
  }
  let focused: "own" | "enemy" | "all" = "all";
  window.addEventListener("resize", resize);
  // sidebars/drawers resize the canvas box without a window resize
  const resizeObs = new ResizeObserver(() => resize());
  resizeObs.observe(canvas);
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
      cam.target.x = clamp(cam.target.x, -panLimX(), panLimX());
      cam.target.z = clamp(cam.target.z, -panLimZ(), panLimZ());
    }
    applyCamera();

    // legend letters: fixed heights (static), but shifted along the camera
    // ray like the ships so each letter projects exactly onto its
    // row/column centre line regardless of camera position
    const camY = Math.max(camera.position.y, 1);
    const kp = 1.7 / camY; // letter anchor height
    for (const mk of markers) {
      mk.sprite.position.x = mk.x + (camera.position.x - mk.x) * kp;
      mk.sprite.position.z = mk.z + (camera.position.z - mk.z) * kp;
    }

    // ships ride the swell: heave + pitch + roll + a slow independent sway
    for (const s of ships) {
      const o = s.obj;
      const hl = (o.userData.hullLen as number) / 2;
      const yaw = o.userData.yaw as number;
      const fw = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const sd = { x: -fw.z, z: fw.x };
      const cx = o.userData.baseX as number; // unshifted cell centre
      const cz = o.userData.baseZ as number;
      const hC = waveHeight(cx, cz, clock, WAVES);
      const hB = waveHeight(cx + fw.x * hl, cz + fw.z * hl, clock, WAVES);
      const hS = waveHeight(cx - fw.x * hl, cz - fw.z * hl, clock, WAVES);
      const hP = waveHeight(cx + sd.x * 1.8, cz + sd.z * 1.8, clock, WAVES);
      const hQ = waveHeight(cx - sd.x * 1.8, cz - sd.z * 1.8, clock, WAVES);
      if (s.sinking > 0 && s.sinking < 1) s.sinking = Math.min(1, s.sinking + dt * 0.35);
      const sink = s.sinking;
      const pitch = clamp(Math.atan2(hB - hS, hl * 2), -SHIP_PITCH_MAX, SHIP_PITCH_MAX);
      const roll = clamp(Math.atan2(hP - hQ, 3.6), -SHIP_ROLL_MAX, SHIP_ROLL_MAX);
      const swayYaw = Math.sin(clock * 0.21 + s.sway) * SHIP_SWAY_MAX;
      o.position.y = hC * 0.5 - sink * 0.6;
      // anti-parallax: the deck sits at ~SHIP_FLOAT_H; shift the group
      // along the camera ray so its projection stays on the cell centre
      const deckH = o.position.y + SHIP_FLOAT_H;
      const pk = deckH / Math.max(camera.position.y, 1);
      o.position.x = cx + (camera.position.x - cx) * pk;
      o.position.z = cz + (camera.position.z - cz) * pk;
      const grad = ((o.userData.sprite as Mesh).material as MeshStandardMaterial)
        .userData.gradU as
        | Record<string, { value: { set(x: number, z: number): void } }>
        | undefined;
      grad?.uHullC!.value.set(o.position.x, o.position.z);
      // drop shadow: pinned to the water, offset growing with the heave
      const blob = o.userData.blob as Mesh;
      const sp = o.userData.sunPx as { x: number; z: number };
      const bb = o.userData.blobBase as { x: number; z: number };
      const lift = Math.max(0.2, deckH / SHIP_FLOAT_H);
      blob.position.x = bb.x + sp.x * lift;
      blob.position.z = bb.z + sp.z * lift;
      blob.position.y = 0.1 - o.position.y; // lands at world ~0.1
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

    // reticle: parallax-corrected so it lands dead-centre on the cell
    if (reticleCell) {
      const w = cellToWorld("enemy", reticleCell);
      const hgt = waveHeight(w.x, w.z, clock, WAVES);
      const shake = reticleShake > 0 ? Math.sin(reticleShake * 60) * reticleShake * 0.5 : 0;
      const rh = hgt + 0.55;
      const rk = rh / Math.max(camera.position.y, 1);
      reticle.position.set(
        w.x + (camera.position.x - w.x) * rk + shake,
        rh,
        w.z + (camera.position.z - w.z) * rk,
      );
      reticle.visible = true;
      reticleShake = Math.max(0, reticleShake - dt);
      hoverCellU.set(reticleCell.col, reticleCell.row, 1);
    } else {
      reticle.visible = false;
      hoverCellU.z = 0;
    }

    // debug cell tints / wreck glow / outlines ride the swell
    for (const t of tintQuads) {
      t.m.position.y = waveHeight(t.x, t.z, clock, WAVES) + 0.12;
    }
    for (const t of ringQuads) {
      t.m.position.y = waveHeight(t.x, t.z, clock, WAVES) + 0.16;
    }

    // ghost hull: flat (no heave), shifted like the ships so it projects
    // exactly onto its squares
    if (ghost) {
      const gx = ghost.userData.baseX as number;
      const gz = ghost.userData.baseZ as number;
      const gk = SHIP_FLOAT_H / Math.max(camera.position.y, 1);
      ghost.position.set(
        gx + (camera.position.x - gx) * gk,
        0,
        gz + (camera.position.z - gz) * gk,
      );
    }
    for (const b of Object.values(badges)) {
      const bk = 2.2 / Math.max(camera.position.y, 1);
      b.sp.position.set(
        b.x + (camera.position.x - b.x) * bk,
        2.2,
        b.z + (camera.position.z - b.z) * bk,
      );
    }

    // shot markers bob + stay centred over their cell (parallax shift)
    for (const m of shotMarkers) {
      const mh = waveHeight(m.x, m.z, clock, WAVES) + 0.42;
      const mk = mh / Math.max(camera.position.y, 1);
      m.obj.position.set(
        m.x + (camera.position.x - m.x) * mk,
        mh,
        m.z + (camera.position.z - m.z) * mk,
      );
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
        addShotMarker(grid, shot.coord, false);
      } else {
        spawnFlash(w.x, w.z);
        spawnSplash(w.x, w.z);
        const mark = addShotMarker(grid, shot.coord, true);
        if (side === "enemy" && shot.shipId !== undefined) {
          enemyHitMarks.push({
            shipId: shot.shipId,
            obj: mark,
            grid,
            cell: shot.coord,
            x: w.x,
            z: w.z,
          });
        }
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
      // diff so unchanged hulls keep riding the swell undisturbed
      for (const s of ships.filter((sh) => sh.side === "player")) {
        if (!placements.some((p) => samePlacement(p, s.placement))) removeShip(s);
      }
      for (const p of placements) {
        if (!ships.some((s) => s.side === "player" && samePlacement(p, s.placement))) {
          addShip(p, "player", ownColor);
        }
      }
    },
    setFleetColors(own, ai) {
      ownColor = own;
      aiColor = ai;
    },
    setPreview(grid, tiles) {
      setTiles(`preview-${grid}`, grid, tiles);
    },
    setGhost,
    setEnemyFog(visible) {
      enemyFog.visible = visible;
    },
    moveOwnShip(from, to) {
      const s = ships.find((sh) => sh.side === "player" && sh.placement.id === from.id);
      const old = shipCells(from).map((c) => cellToWorld("player", c));
      // the old berth stops burning; the enemy's X marks stay as history
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i]!;
        if (old.some((o) => o.x === f.x && o.z === f.z)) {
          scene.remove(f.sp);
          fires.splice(i, 1);
        }
      }
      if (s) removeShip(s);
      addShip(to, "player", ownColor);
      const mid = placementMid("player", to);
      spawnSplash(mid.x, mid.z);
    },
    enemyRelocated(shipId) {
      for (const m of enemyHitMarks.filter((h) => h.shipId === shipId)) {
        m.obj.traverse((o) => {
          if ((o as Mesh).isMesh) (o as Mesh).material = staleMat;
        });
        for (let i = fires.length - 1; i >= 0; i--) {
          if (fires[i]!.x === m.x && fires[i]!.z === m.z) {
            scene.remove(fires[i]!.sp);
            fires.splice(i, 1);
          }
        }
      }
    },
    scout(center, count, by) {
      const grid: GridId = by === 0 ? "enemy" : "player";
      const tiles: PreviewTile[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const c = { row: center.row + dr, col: center.col + dc };
          if (c.row >= 0 && c.row < 10 && c.col >= 0 && c.col < 10) tiles.push({ cell: c, tone: "scout" });
        }
      }
      setTiles(`scout-${grid}`, grid, tiles);
      const old = badges[grid];
      if (old) {
        scene.remove(old.sp);
        (old.sp.material as SpriteMaterial).map?.dispose();
        old.sp.material.dispose();
      }
      const w = cellToWorld(grid, center);
      const sp = new Sprite(new SpriteMaterial({ map: countBadge(count), transparent: true, depthTest: false }));
      sp.scale.set(3.4, 3.4, 1);
      sp.renderOrder = 12;
      scene.add(sp);
      badges[grid] = { sp, grid, cell: center, x: w.x, z: w.z };
    },
    showCells() {
      cellsShown = true;
      for (const s of ships) {
        addCellTints(s.placement, s.side, SHIP_TINTS[ships.indexOf(s) % SHIP_TINTS.length]!, 0.28);
      }
    },
    focus(which) {
      focused = which;
      userZoomed = false;
      cam.target.set(
        which === "all" ? 0 : gridCenterX(which === "own" ? "player" : "enemy"),
        0,
        which === "all" ? 0 : gridCenterZ(which === "own" ? "player" : "enemy"),
      );
      cam.dist = which === "all" ? fitDist() : fitOneDist();
      cam.lastInput = performance.now();
    },
    /** debug: project a world point to screen px through the camera */
    project(wx: number, wy: number, wz: number) {
      const v = new Vector3(wx, wy, wz).project(camera);
      return {
        x: ((v.x + 1) / 2) * canvas.clientWidth,
        y: ((1 - v.y) / 2) * canvas.clientHeight,
      };
    },
    /** debug: dump ship render state for verification */
    inspectShips() {
      return ships.map((s) => {
        const sp = s.obj.userData.sprite as Mesh;
        const m = sp.material as MeshStandardMaterial;
        const img = m.map?.image as { width?: number } | undefined;
        return {
          id: s.placement.id,
          side: s.side,
          pos: s.obj.position.toArray().map((v) => +v.toFixed(2)),
          scale: s.obj.scale.toArray().map((v) => +v.toFixed(4)),
          spriteY: sp.position.y,
          mapW: img?.width ?? 0,
          hasNormal: !!m.normalMap,
          grad: !!(m.userData as { gradU?: unknown }).gradU,
          opacity: m.opacity,
        };
      });
    },
    /** debug: force a camera pitch/distance for verification shots */
    pitchAt(deg: number, dist = 50) {
      cam.pitch = (deg * Math.PI) / 180;
      cam.dist = dist;
      userZoomed = true;
      cam.lastInput = performance.now();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      resizeObs.disconnect();
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

  return view;
}

function placementMid(grid: GridId, p: Placement): { x: number; z: number } {
  const cells = shipCells(p).map((c) => cellToWorld(grid, c));
  return {
    x: cells.reduce((a, c) => a + c.x, 0) / cells.length,
    z: cells.reduce((a, c) => a + c.z, 0) / cells.length,
  };
}
