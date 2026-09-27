import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

/** All textures are painted onto canvases — zero external assets. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function toTex(c: HTMLCanvasElement, srgb = true): Texture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function hash(i: number, s: number): number {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Painted hull side: horizontal planks over a base coat, a coloured
 * wale/trim band, and (optionally) rows of gun ports. The lofted hull UVs
 * run u = bow→stern along the length, v = keel→rail.
 */
export function hullTexture(opts: {
  base: string;
  trim: string;
  trim2?: string;
  gunDecks?: number; // rows of gun ports under the rail
  railColor?: string;
}): Texture {
  const [c, g] = canvas(512, 256);
  g.fillStyle = opts.base;
  g.fillRect(0, 0, 512, 256);
  // plank seams + grain streaks
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.fillRect(0, y, 512, 2);
    for (let i = 0; i < 30; i++) {
      const x = hash(i, y) * 512;
      const w = 20 + hash(i + 9, y) * 60;
      g.fillStyle = `rgba(${hash(i, y * 2) > 0.5 ? "255,240,210" : "0,0,0"},${(0.04 + hash(i, y * 3) * 0.08).toFixed(3)})`;
      g.fillRect(x, y + 3, w, 10);
    }
  }
  // wale / trim band near the rail (v≈1 → top of texture since v=1 is rail)
  g.fillStyle = opts.trim;
  g.fillRect(0, 12, 512, 14);
  if (opts.trim2) {
    g.fillStyle = opts.trim2;
    g.fillRect(0, 46, 512, 8);
  }
  g.fillStyle = opts.railColor ?? "#3a2415";
  g.fillRect(0, 0, 512, 6);
  // gun ports between the trim band and mid hull
  const decks = opts.gunDecks ?? 0;
  for (let d = 0; d < decks; d++) {
    const py = 66 + d * 38;
    for (let i = 0; i < 18; i++) {
      const x = 18 + i * 27;
      g.fillStyle = "#d8c890";
      g.fillRect(x - 2, py - 2, 16, 18);
      g.fillStyle = "#0c0805";
      g.fillRect(x, py, 12, 14);
    }
  }
  const t = toTex(c);
  t.wrapS = RepeatWrapping;
  return t;
}

export type SailEmblem =
  | "cross"      // red crosses/stripes (Man-o'-War)
  | "lion"      // red shield + gold lion (Galleon)
  | "compass"   // blue-gold compass rose (Frigate)
  | "star"      // white/silver star on black (Brigantine)
  | "tree"      // green circle + tree (Sloop)
  | "plain";

/** Cream (or black) sail cloth with painted emblem + edge shading. */
export function sailTexture(opts: {
  cloth: string;
  emblem: SailEmblem;
  emblemColor: string;
  emblemColor2?: string;
  stripes?: string;
}): Texture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = opts.cloth;
  g.fillRect(0, 0, S, S);
  // cloth weave + weathering
  for (let i = 0; i < 900; i++) {
    const x = hash(i, 1) * S;
    const y = hash(i, 2) * S;
    g.fillStyle = `rgba(${hash(i, 3) > 0.5 ? "255,255,240" : "60,40,20"},0.05)`;
    g.fillRect(x, y, 3, 12 + hash(i, 4) * 22);
  }
  // seam lines radiating from the top corners (like panelled sail cloth)
  g.strokeStyle = "rgba(0,0,0,0.10)";
  g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.moveTo(0, (i * S) / 6);
    g.quadraticCurveTo(S / 2, (i * S) / 6 + 18, S, (i * S) / 6);
    g.stroke();
  }
  // vertical accent stripes
  if (opts.stripes) {
    g.fillStyle = opts.stripes;
    for (const sx of [0.16, 0.5, 0.84]) {
      g.fillRect(sx * S - 14, 0, 28, S);
    }
  }
  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.26;
  g.save();
  switch (opts.emblem) {
    case "cross": {
      // bold red cross (templar-style) centre
      g.fillStyle = opts.emblemColor;
      g.fillRect(cx - R * 0.22, cy - R, R * 0.44, R * 2);
      g.fillRect(cx - R, cy - R * 0.22, R * 2, R * 0.44);
      break;
    }
    case "lion": {
      // red shield with a gold lion silhouette (stylised)
      g.fillStyle = opts.emblemColor;
      g.beginPath();
      g.moveTo(cx - R * 0.9, cy - R * 0.7);
      g.lineTo(cx + R * 0.9, cy - R * 0.7);
      g.lineTo(cx + R * 0.9, cy + R * 0.25);
      g.quadraticCurveTo(cx, cy + R * 1.05, cx - R * 0.9, cy + R * 0.25);
      g.closePath();
      g.fill();
      g.strokeStyle = opts.emblemColor2 ?? "#e8c860";
      g.lineWidth = 8;
      g.stroke();
      // lion: body + legs + head + tail as chunky strokes
      g.strokeStyle = opts.emblemColor2 ?? "#e8c860";
      g.fillStyle = opts.emblemColor2 ?? "#e8c860";
      g.lineWidth = 14;
      g.beginPath();
      g.moveTo(cx - R * 0.45, cy + R * 0.1); // chest
      g.quadraticCurveTo(cx - R * 0.5, cy - R * 0.4, cx - R * 0.15, cy - R * 0.42);
      g.quadraticCurveTo(cx + R * 0.35, cy - R * 0.45, cx + R * 0.4, cy - R * 0.05);
      g.quadraticCurveTo(cx + R * 0.42, cy + R * 0.3, cx + R * 0.1, cy + R * 0.42);
      g.stroke();
      // legs
      for (const [dx, dy] of [[-0.4, 0.55], [-0.1, 0.6], [0.25, 0.55]] as const) {
        g.beginPath();
        g.moveTo(cx + dx * R, cy + R * 0.35);
        g.lineTo(cx + dx * R - R * 0.05, cy + dy * R);
        g.stroke();
      }
      // head
      g.beginPath();
      g.arc(cx - R * 0.42, cy - R * 0.5, R * 0.17, 0, Math.PI * 2);
      g.fill();
      // tail
      g.beginPath();
      g.moveTo(cx + R * 0.42, cy - R * 0.1);
      g.quadraticCurveTo(cx + R * 0.75, cy - R * 0.35, cx + R * 0.55, cy - R * 0.62);
      g.stroke();
      break;
    }
    case "compass": {
      // 8-point compass rose, blue and gold
      g.strokeStyle = opts.emblemColor;
      g.lineWidth = 10;
      g.beginPath();
      g.arc(cx, cy, R * 0.85, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const len = i % 2 === 0 ? R * 0.8 : R * 0.5;
        g.fillStyle = i % 2 === 0 ? opts.emblemColor : (opts.emblemColor2 ?? "#e8c860");
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        g.lineTo(cx + Math.cos(a + 0.35) * R * 0.18, cy + Math.sin(a + 0.35) * R * 0.18);
        g.lineTo(cx + Math.cos(a - 0.35) * R * 0.18, cy + Math.sin(a - 0.35) * R * 0.18);
        g.closePath();
        g.fill();
      }
      g.fillStyle = opts.emblemColor2 ?? "#e8c860";
      g.beginPath();
      g.arc(cx, cy, R * 0.14, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case "star": {
      // silver compass star
      g.fillStyle = opts.emblemColor;
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8 - Math.PI / 2;
        const len = i % 2 === 0 ? R : R * 0.28;
        const px = cx + Math.cos(a) * len;
        const py = cy + Math.sin(a) * len;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      // inner ring
      g.strokeStyle = opts.emblemColor;
      g.lineWidth = 6;
      g.beginPath();
      g.arc(cx, cy, R * 0.45, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case "tree": {
      // green roundel with a tree
      g.fillStyle = opts.emblemColor;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#f0e6c8";
      g.lineWidth = 10;
      g.stroke();
      // trunk + canopy
      g.strokeStyle = "#5a3a1a";
      g.lineWidth = 16;
      g.beginPath();
      g.moveTo(cx, cy + R * 0.55);
      g.lineTo(cx, cy - R * 0.1);
      g.stroke();
      g.fillStyle = "#1e5c26";
      for (const [ox, oy, r] of [[-0.3, -0.25, 0.34], [0.3, -0.25, 0.34], [0, -0.5, 0.4]] as const) {
        g.beginPath();
        g.arc(cx + ox * R, cy + oy * R, r * R, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case "plain":
      break;
  }
  g.restore();
  return toTex(c);
}

/** Parchment plaque with a brass rim, used for the row/column markers. */
export function plaqueTexture(label: string): Texture {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  // brass rim
  g.fillStyle = "#7a5c28";
  g.beginPath();
  g.roundRect(4, 4, S - 8, S - 8, 22);
  g.fill();
  // parchment face
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, "#e8d7a8");
  grad.addColorStop(1, "#cdb284");
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(12, 12, S - 24, S - 24, 16);
  g.fill();
  // dark ink label
  g.fillStyle = "#241708";
  g.font = `700 ${S * 0.5}px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, S / 2, S / 2 + S * 0.03);
  return toTex(c);
}

/** Soft radial puff for particles/sprites (white; tint via material color). */
export function puffTexture(): Texture {
  const S = 128;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return toTex(c, false);
}
