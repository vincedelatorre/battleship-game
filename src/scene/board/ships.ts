import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  type Object3D,
  type Texture,
} from "three";
import type { CaptainId, ShipId } from "../../engine/index";
import { type GridId, placementTransform, spriteUnitsPerPixel } from "./layout";
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
    texCache.set(key, t);
  }
  return t;
}

let blobTex: Texture | null = null;
function blobTexture(): Texture {
  if (!blobTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, "rgba(0,15,22,0.8)");
    grad.addColorStop(1, "rgba(0,15,22,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    blobTex = new CanvasTexture(c);
  }
  return blobTex;
}

/**
 * A painted top-down ship sprite lying on the water, plus a soft blob
 * shadow under it. The sprite plane is sized in "pixel units"; the group
 * scale (units per pixel) is set by placeShipObject so the full sprite —
 * sails, pennants and all — stays on the ship's cells.
 */
export function createShip(id: ShipId, color: FleetColor, meta: SpriteMeta): Object3D {
  const g = new Group();
  const tex = shipTexture(color, id);

  const sprite = new Mesh(
    new PlaneGeometry(meta.w, meta.h),
    // unlit + a warm sun tint keeps the painted sprites crisp
    new MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.12,
      color: 0xfff0da,
    }),
  );
  sprite.rotation.x = -Math.PI / 2;
  sprite.position.set((0.5 - meta.lenCx) * meta.w, 0.36, (0.5 - meta.hullCy) * meta.h);
  g.add(sprite);

  // blob shadow hugs the hull footprint, not the whole sprite
  const blob = new Mesh(
    new PlaneGeometry(meta.w * meta.hullFraction, meta.h * 0.55),
    new MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set((0.5 - meta.lenCx) * meta.w, 0.14, (0.5 - meta.hullCy) * meta.h + meta.h * 0.04);
  blob.renderOrder = -1;
  g.add(blob);

  g.userData.sprite = sprite;
  g.userData.blob = blob;
  g.userData.meta = meta;
  return g;
}

/**
 * Positions a ship group centred on its cells. Non-uniform scale: the
 * full sprite length spans cells×4×0.96; the beam is squeezed to at most
 * 1.5 cells (slimmer sprites keep their natural aspect).
 */
export function placeShipObject(
  ship: Object3D,
  grid: GridId,
  p: Placement,
): void {
  const t = placementTransform(grid, p);
  const meta = ship.userData.meta as SpriteMeta;
  const { kx, ky } = spriteUnitsPerPixel(t.spanCells, meta.w, meta.h, meta.lenFraction);
  ship.scale.set(kx, 1, ky);
  ship.position.set(t.x, 0, t.z);
  ship.rotation.y = t.yaw;
  ship.userData.hullLen = meta.w * meta.lenFraction * kx;
  ship.userData.beam = meta.h * ky * 0.6;
  ship.userData.yaw = t.yaw;
}
