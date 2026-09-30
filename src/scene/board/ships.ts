import {
  CanvasTexture,
  Group,
  TextureLoader,
  LinearMipmapLinearFilter,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector2,
  type Object3D,
  type Texture,
} from "three";
import type { CaptainId, ShipId } from "../../engine/index";
import {
  type GridId,
  placementTransform,
  spriteUnitsPerPixel,
  SHIP_FLOAT_H,
} from "./layout";
import type { Placement } from "../../engine/types";

/** Fleet sprite colours map to captains: Crow blue, Powderkeg red,
 *  Broadside green, Ghost black. */
export type FleetColor = "blue" | "red" | "green" | "black";

export function captainColor(id: CaptainId): FleetColor {
  switch (id) {
    case "captain-crowsnest":
      return "blue";
    case "captain-powderkeg":
      return "red";
    case "captain-broadside":
      return "green";
    case "captain-ghostship":
      return "black";
  }
}

export interface SpriteMeta {
  w: number;
  h: number;
  hullFraction: number;
  /** hull centre in the sprite, as a fraction of w/h (pennants skew the bbox) */
  hullCx: number;
  hullCy: number;
  /** body extent along x (columns with real ship, pennant wisps excluded) */
  lenFraction: number;
  /** centre of that extent, as a fraction of w */
  lenCx: number;
}
export type ShipManifest = Record<string, SpriteMeta>;

export async function loadShipManifest(): Promise<ShipManifest> {
  const r = await fetch("/assets/ships/manifest.json");
  return (await r.json()) as ShipManifest;
}

const texCache = new Map<string, Texture>();
function shipTexture(color: FleetColor, id: ShipId): Texture {
  const key = `${color}/${id}`;
  let t = texCache.get(key);
  if (!t) {
    t = new TextureLoader().load(`/assets/ships/${color}/${id}.png`);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.generateMipmaps = true;
    texCache.set(key, t);
  }
  return t;
}

/** pixel data of a sprite, fetched once per sprite for map building */
const rgbaCache = new Map<string, Promise<ImageData>>();
function spritePixels(color: FleetColor, id: ShipId): Promise<ImageData> {
  const key = `${color}/${id}`;
  let p = rgbaCache.get(key);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.src = `/assets/ships/${color}/${id}.png`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, c.width, c.height);
    })();
    rgbaCache.set(key, p);
  }
  return p;
}

/** separable box blur on the alpha channel (r ≈ radius px) */
function blurAlpha(a: ArrayLike<number>, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

/**
 * Builds two derived maps from a sprite's alpha:
 *  - a normal map: blurred alpha as a dome-shaped height field, so the
 *    directional light gives the flat art a sunlit edge and a shaded far
 *    side — the "solid 3D piece" cue.
 *  - a shadow map: the blurred alpha as a soft black silhouette.
 */
const derivedCache = new Map<string, Promise<{ normal: Texture; shadow: Texture }>>();
function derivedMaps(color: FleetColor, id: ShipId): Promise<{ normal: Texture; shadow: Texture }> {
  const key = `${color}/${id}`;
  let p = derivedCache.get(key);
  if (!p) {
    p = buildDerivedMaps(color, id);
    derivedCache.set(key, p);
  }
  return p;
}

async function buildDerivedMaps(
  color: FleetColor,
  id: ShipId,
): Promise<{ normal: Texture; shadow: Texture }> {
  const src = await spritePixels(color, id);
  const { width: w, height: h, data } = src;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3]!;
  const heightF = blurAlpha(blurAlpha(alpha, w, h, 2), w, h, 2);

  // normal map (OpenGL convention: +g = up in texture space)
  const nc = document.createElement("canvas");
  nc.width = w;
  nc.height = h;
  const ng = nc.getContext("2d")!;
  const nout = ng.createImageData(w, h);
  const k = (4.2 * Math.min(w, h)) / 200; // height-field strength
  const at = (x: number, y: number) =>
    heightF[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * (k / 255);
      const dy = (at(x, y + 1) - at(x, y - 1)) * (k / 255);
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      nout.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      nout.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      nout.data[i + 2] = inv * 255;
      nout.data[i + 3] = 255;
    }
  }
  ng.putImageData(nout, 0, 0);
  const normal = new CanvasTexture(nc);
  normal.minFilter = LinearMipmapLinearFilter;
  normal.generateMipmaps = true;

  // soft black silhouette for the drop shadow
  const sc = document.createElement("canvas");
  sc.width = w;
  sc.height = h;
  const sg = sc.getContext("2d")!;
  const sout = sg.createImageData(w, h);
  const shadowA = blurAlpha(alpha, w, h, 4);
  for (let i = 0; i < w * h; i++) {
    sout.data[i * 4 + 3] = shadowA[i]! * 0.85;
  }
  sg.putImageData(sout, 0, 0);
  const shadow = new CanvasTexture(sc);
  shadow.minFilter = LinearMipmapLinearFilter;
  shadow.generateMipmaps = true;
  return { normal, shadow };
}

/**
 * A painted top-down ship sprite floating just above the water, plus a
 * blurred silhouette shadow cast on the surface. The sprite is centred
 * on the hull (hullCx/hullCy), not the bbox — pennants trail to one
 * side and would skew the centring.
 */
export function createShip(id: ShipId, color: FleetColor, meta: SpriteMeta): Object3D {
  const g = new Group();
  const tex = shipTexture(color, id);

  const sprite = new Mesh(
    new PlaneGeometry(meta.w, meta.h),
    new MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.12,
      roughness: 0.85,
      metalness: 0,
      envMapIntensity: 0.45, // keep the painted colours dominant
      depthTest: false, // the water never clips a hull
    }),
  );
  sprite.rotation.x = -Math.PI / 2;
  // centre the dense hull body on the group origin; deck floats at SHIP_FLOAT_H
  sprite.position.set(
    (0.5 - meta.hullCx) * meta.w,
    SHIP_FLOAT_H,
    (0.5 - meta.hullCy) * meta.h,
  );
  sprite.renderOrder = 3; // above ocean + static grid, below markers
  {
    // directional shading: hull reads rounded — lit toward the sun, shaded away
    const m = sprite.material as MeshStandardMaterial;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSunXZ = { value: new Vector2(0.84, -0.54) };
      sh.uniforms.uHullC = { value: new Vector2(0, 0) };
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vDeckW;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvDeckW = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vDeckW;\nuniform vec2 uSunXZ;\nuniform vec2 uHullC;",
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
      {
        vec2 gd = vDeckW.xz - uHullC;
        float sunSide = dot(gd, uSunXZ) / max(length(gd), 1e-3);
        diffuseColor.rgb *= 1.0 + 0.12 * max(sunSide, 0.0) - 0.18 * max(-sunSide, 0.0);
      }`,
        );
      (m.userData as { gradU?: Record<string, { value: Vector2 }> }).gradU =
        sh.uniforms as Record<string, { value: Vector2 }>;
    };
  }
  g.add(sprite);

  // drop shadow: blurred silhouette, offset sun-ward in placeShipObject,
  // pinned to the water surface by the animation loop
  const blob = new Mesh(
    new PlaneGeometry(meta.w, meta.h),
    new MeshStandardMaterial({
      color: 0x000a19,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      depthTest: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(
    (0.5 - meta.hullCx) * meta.w,
    0.08,
    (0.5 - meta.hullCy) * meta.h,
  );
  blob.renderOrder = 1;
  g.add(blob);

  void derivedMaps(color, id).then(({ normal, shadow }) => {
    const m = sprite.material as MeshStandardMaterial;
    m.normalMap = normal;
    m.normalScale.set(3.4, -3.4); // flip G so the sun edge lights
    m.needsUpdate = true;
    (blob.material as MeshStandardMaterial).map = shadow;
    (blob.material as MeshStandardMaterial).needsUpdate = true;
  });

  g.userData.sprite = sprite;
  g.userData.blob = blob;
  g.userData.meta = meta;
  return g;
}



/**
 * Positions a ship group centred on its cells. Symmetric fit around the
 * hull centre: the farthest pixel on each side stays inside the margins
 * (length ≤ cells×4−0.5, beam ≤ 4×0.82); only the beam axis squeezes.
 */
export function placeShipObject(
  ship: Object3D,
  grid: GridId,
  p: Placement,
): void {
  const t = placementTransform(grid, p);
  const meta = ship.userData.meta as SpriteMeta;
  const { kx, ky } = spriteUnitsPerPixel(
    t.spanCells,
    meta.w,
    meta.h,
    meta.hullCx,
    meta.hullCy,
  );
  ship.scale.set(kx, 1, ky);
  ship.position.set(t.x, 0, t.z);
  ship.rotation.y = t.yaw;
  ship.userData.hullLen = meta.w * meta.lenFraction * kx;
  ship.userData.beam = meta.h * ky * 0.6;
  ship.userData.yaw = t.yaw;
  ship.userData.baseX = t.x; // cell centre before parallax shift
  ship.userData.baseZ = t.z;
  // shadow sun-offset in sprite-local px (undo yaw + non-uniform scale);
  // the anim loop scales it with the heave height — ~1.4 world units at
  // deck height, away from the sun (SUN_DIR.xz ≈ (0.84,-0.54))
  const cy = Math.cos(t.yaw), sy = Math.sin(t.yaw);
  const wx = -0.84 * 1.4, wz = 0.54 * 1.4;
  ship.userData.sunPx = {
    x: (wx * cy - wz * sy) / kx,
    z: (wx * sy + wz * cy) / ky,
  };
  ship.userData.blobBase = {
    x: (0.5 - meta.hullCx) * meta.w,
    z: (0.5 - meta.hullCy) * meta.h,
  };
}
