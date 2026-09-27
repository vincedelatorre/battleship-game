/**
 * Pirate glyph lettering — loads the extracted sprite font from
 * /assets/font/ and composes labels/titles on canvases.
 * Used by the board legends and the storm menu title.
 */

export type GlyphMeta = { w: number; h: number; baseline: number; descender: number };
type Manifest = Record<string, GlyphMeta>;

let manifest: Manifest | null = null;
const imgCache = new Map<string, HTMLImageElement>();
const imgPromises = new Map<string, Promise<HTMLImageElement>>();

function loadImage(ch: string): Promise<HTMLImageElement> {
  let p = imgPromises.get(ch);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        imgCache.set(ch, im);
        res(im);
      };
      im.onerror = () => rej(new Error(`glyph ${ch} failed to load`));
      im.src = `/assets/font/${encodeURIComponent(ch)}.png`;
    });
    imgPromises.set(ch, p);
  }
  return p;
}

/** Fetch the manifest and preload every glyph image (once). */
export async function loadGlyphs(): Promise<void> {
  if (!manifest) {
    const r = await fetch("/assets/font/manifest.json");
    manifest = (await r.json()) as Manifest;
  }
  await Promise.all(Object.keys(manifest).map((ch) => loadImage(ch)));
}

export function glyphMeta(ch: string): GlyphMeta {
  const m = manifest?.[ch];
  if (!m) throw new Error(`glyph ${ch} not loaded`);
  return m;
}

function glyphImg(ch: string): HTMLImageElement {
  const img = imgCache.get(ch);
  if (!img) throw new Error(`glyph ${ch} not loaded`);
  return img;
}

/**
 * A single glyph composited for the water: dark navy outline + soft
 * drop shadow so the gold reads on blue. Returns the canvas.
 */
export function glyphLabelCanvas(ch: string): HTMLCanvasElement {
  const img = glyphImg(ch);
  const m = glyphMeta(ch);
  const pad = Math.max(6, Math.round(m.h * 0.12));
  const c = document.createElement("canvas");
  c.width = m.w + pad * 2;
  c.height = m.h + pad * 2;
  const g = c.getContext("2d")!;
  // dark silhouette tint for the outline passes
  const tint = document.createElement("canvas");
  tint.width = c.width;
  tint.height = c.height;
  const tg = tint.getContext("2d")!;
  tg.drawImage(img, pad, pad);
  tg.globalCompositeOperation = "source-in";
  tg.fillStyle = "#060d18";
  tg.fillRect(0, 0, tint.width, tint.height);
  // outline: 8 offset draws of the tint
  const o = Math.max(1.5, m.h * 0.025);
  const offs: [number, number][] = [
    [-o, 0], [o, 0], [0, -o], [0, o],
    [-o, -o], [o, -o], [-o, o], [o, o],
  ];
  for (const [dx, dy] of offs) {
    g.drawImage(tint, dx, dy);
  }
  // soft drop shadow under the letter
  g.shadowColor = "rgba(2,8,20,0.85)";
  g.shadowBlur = m.h * 0.08;
  g.shadowOffsetY = m.h * 0.04;
  g.drawImage(img, pad, pad);
  g.shadowColor = "transparent";
  g.drawImage(img, pad, pad); // crisp copy on top
  return c;
}

/** Reference cap height in the manifest (typical letter baseline offset). */
const CAP_REF = 100;

export type TextStyle = {
  capH: number;      // rendered cap height in px
  spacing: number;   // extra tracking as a fraction of capH
  spaceW: number;    // word gap as a fraction of capH
};

/**
 * Compose one line of glyph text (uppercase letters + digits) onto a
 * canvas, baseline-aligned, with the dark outline baked per glyph.
 */
export function composeLine(
  text: string,
  { capH, spacing, spaceW }: TextStyle,
): HTMLCanvasElement {
  const s = capH / CAP_REF;
  const items = [...text].map((ch) =>
    ch === " " ? null : { ch, m: glyphMeta(ch) },
  );
  const track = capH * spacing;
  let w = 0;
  for (const it of items) w += it ? it.m.w * s + track : capH * spaceW;
  w = Math.ceil(w - track) + Math.ceil(capH * 0.25);
  const pad = Math.ceil(capH * 0.22);
  const c = document.createElement("canvas");
  c.width = w + pad * 2;
  c.height = Math.ceil(capH * 1.3) + pad * 2;
  const g = c.getContext("2d")!;
  const baselineY = pad + capH;
  let x = pad;
  for (const it of items) {
    if (!it) {
      x += capH * spaceW;
      continue;
    }
    const lab = glyphLabelCanvas(it.ch);
    const dy = baselineY - it.m.baseline * s;
    g.drawImage(lab, x - pad * s, dy - pad * s, it.m.w * s + pad * s * 2, it.m.h * s + pad * s * 2);
    x += it.m.w * s + track;
  }
  return c;
}
