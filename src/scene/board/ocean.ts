import {
  DataTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import type { Swell } from "../storm/waves";

/** Calm battle sea — heavy storm swell would hide the board. */
export const BOARD_WAVES: readonly Swell[] = [
  { dx: 0.72, dz: 0.69, amp: 0.55, freq: 0.09, speed: 0.8, q: 0.4 },
  { dx: -0.5, dz: 0.87, amp: 0.42, freq: 0.14, speed: 1.1, q: 0.35 },
  { dx: 0.94, dz: -0.34, amp: 0.3, freq: 0.22, speed: 1.5, q: 0.3 },
  { dx: -0.2, dz: -0.98, amp: 0.26, freq: 0.3, speed: 1.9, q: 0.3 },
  { dx: 0.38, dz: 0.93, amp: 0.18, freq: 0.45, speed: 2.4, q: 0.25 },
  { dx: -0.86, dz: -0.51, amp: 0.12, freq: 0.66, speed: 3.0, q: 0.2 },
];

const NOISE = /* glsl */ `
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const GRID_HELPERS = /* glsl */ `
// smooth rect coverage: 1 inside, soft falloff over pad units
float inGridSoft(vec2 p, vec2 mn, float pad) {
  vec2 c = mn + vec2(20.0);
  vec2 d = abs(p - c) - vec2(20.0);
  float outside = length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-pad, pad, outside);
}
`;

function gerstnerGLSL(waves: readonly Swell[]): string {
  return waves
    .map(
      (w) => `{
      float ph = ${w.freq.toFixed(4)} * dot(vec2(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}), p.xz)
               + ${w.speed.toFixed(4)} * uTime;
      float s = sin(ph); float c = cos(ph);
      float wa = ${w.freq.toFixed(4)} * ${w.amp.toFixed(4)};
      dp.x += ${w.q.toFixed(4)} * ${w.amp.toFixed(4)} * ${w.dx.toFixed(4)} * c;
      dp.z += ${w.q.toFixed(4)} * ${w.amp.toFixed(4)} * ${w.dz.toFixed(4)} * c;
      dp.y += ${w.amp.toFixed(4)} * s;
      n.x -= ${w.dx.toFixed(4)} * wa * c;
      n.z -= ${w.dz.toFixed(4)} * wa * c;
      n.y -= ${w.q.toFixed(4)} * wa * s;
      crest += ${w.amp.toFixed(4)} * s;
      fold += ${w.q.toFixed(4)} * wa * s; }`,
    )
    .join("\n");
}

const VERT = /* glsl */ `
uniform float uTime;
uniform vec2 uGridA;
uniform vec2 uGridB;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vCrest;
varying float vFold;
${GRID_HELPERS}
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  // swell flattens in the far field so the horizon stays a clean line
  float fade = 1.0 - smoothstep(150.0, 420.0, length(p.xz - cameraPosition.xz));
  // …and calms inside the grids so the drawn lines stay straight
  float inBoard = max(inGridSoft(p.xz, uGridA, 3.0), inGridSoft(p.xz, uGridB, 3.0));
  float calm = 1.0 - 0.55 * inBoard;
  vec3 dp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float crest = 0.0;
  float fold = 0.0;
  ${"" /* GLSL generated below */}
  __GERSTNER__
  float k = fade * calm;
  p += dp * k;
  n = mix(vec3(0.0, 1.0, 0.0), n, k);
  vNormal = normalize(n);
  vWorld = p;
  vCrest = crest * k;
  vFold = fold * k;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

// MAX_HULLS hulls for foam rings (x, z, dirx, dirz) + (halfLen, halfBeam, 0, 0)
const MAX_HULLS = 12;

/**
 * Procedural water normal map — smooth fbm heightfield turned into
 * normals, mipmapped + linearly filtered so micro-facets interpolate
 * smoothly (no cell hashing, no blocky sparkle).
 */
function makeNormalTexture(size = 256): DataTexture {
  const hash = (x: number, y: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // tileable fbm: sample on a torus via two octaves with wrapped lattice
      let hgt = 0, amp = 0.6, fr = 6;
      for (let o = 0; o < 4; o++) {
        const px = (x / size) * fr, py = (y / size) * fr;
        // wrap lattice for tileability
        const xi = Math.floor(px), yi = Math.floor(py);
        const xf = px - xi, yf = py - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const w_ = (i: number, j: number) =>
          hash(((xi + i) % fr + fr) % fr, ((yi + j) % fr + fr) % fr);
        hgt += amp * (
          w_(0, 0) * (1 - u) * (1 - v) + w_(1, 0) * u * (1 - v) +
          w_(0, 1) * (1 - u) * v + w_(1, 1) * u * v
        );
        amp *= 0.5; fr *= 2;
      }
      height[y * size + x] = hgt;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const str = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const ym = (y - 1 + size) % size, yp = (y + 1) % size;
      const dx = (height[y * size + xp]! - height[y * size + xm]!) * str;
      const dy = (height[yp * size + x]! - height[ym * size + x]!) * str;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      data[i + 2] = inv * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSkyColor;      // horizon sky tint for Fresnel
uniform vec3 uHazeColor;     // far-field haze = fog
uniform vec2 uGridA;         // player grid: (minX, minZ), size 40
uniform vec2 uGridB;         // enemy grid (minX, minZ) — extra mist
uniform vec4 uHover;         // hovered enemy cell (cx, cz, on, playerValid?)
uniform vec4 uHullPos[${MAX_HULLS}];  // x, z, dirx, dirz
uniform vec4 uHullSize[${MAX_HULLS}]; // halfLen, halfBeam, 0, 0
uniform int uHullCount;
uniform sampler2D uNormalTex;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vCrest;
varying float vFold;
${NOISE}
${GRID_HELPERS}

// distance to nearest grid line inside a rect (0 at line, in cell units)
float gridLine(vec2 p, vec2 mn, float cell) {
  vec2 q = p - mn;
  vec2 inCell = abs(fract(q / cell) - 0.5) * cell;
  return min(inCell.x, inCell.y);
}
float gridEdge(vec2 p, vec2 mn, float sz) {
  vec2 q = abs(p - mn - vec2(sz * 0.5));
  return sz * 0.5 - max(q.x, q.y);
}
float inRect(vec2 p, vec2 mn, float sz) {
  return step(mn.x, p.x) * step(mn.y, p.y) * step(p.x, mn.x + sz) * step(p.y, mn.y + sz);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);

  // fragment micro-facets: two scrolling taps of the filtered normal map
  vec3 t1 = texture2D(uNormalTex, vWorld.xz * 0.10 + vec2(uTime * 0.012, uTime * 0.007)).rgb * 2.0 - 1.0;
  vec3 t2 = texture2D(uNormalTex, vWorld.xz * 0.29 - vec2(uTime * 0.016, -uTime * 0.010)).rgb * 2.0 - 1.0;
  N = normalize(N + vec3(t1.x + t2.x, 0.0, t1.y + t2.y) * 0.09);

  vec3 deep = vec3(0.0035, 0.036, 0.055);    // #0b3440 in linear
  vec3 surf = vec3(0.013, 0.165, 0.19);      // #1f6f78 in linear

  // slow large-scale depth variation + a drifting cloud shadow
  float depthN = vnoise(vWorld.xz * 0.022 + vec2(uTime * 0.011, 0.0));
  float cloud = vnoise(vWorld.xz * 0.009 - vec2(uTime * 0.006, uTime * 0.004));

  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  vec3 base = mix(deep, surf, 0.35 + 0.16 * depthN);
  vec3 col = mix(base, mix(surf, uSkyColor, fres * 0.55), 0.4 + 0.35 * fres);
  col *= 1.0 - 0.10 * smoothstep(0.55, 0.9, cloud);   // cloud shadow drift
  col = mix(col, surf * 1.12, smoothstep(0.4, 1.4, vCrest) * 0.25);

  // sun: smooth glossy lobe + sparse smooth sparkles
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  // twinkle comes free from the perturbed normals — no hash gate
  float glit = pow(ndh, 750.0) * 1.5;
  col += vec3(1.0, 0.86, 0.6) * glit;
  col += vec3(0.9, 0.75, 0.5) * pow(ndh, 60.0) * 0.10; // soft glossy path

  // subsurface teal on thin crests facing the light
  float subs = pow(max(dot(V, L), 0.0), 4.0);
  col += vec3(0.0, 0.05, 0.045) * subs * smoothstep(0.2, 1.0, vCrest);

  // fine crest foam only — smooth noise, kept subtle
  float fn = vnoise(vWorld.xz * 1.7 + vec2(uTime * 0.3, -uTime * 0.2));
  float foam = smoothstep(0.16, 0.30, vFold) * (0.3 + 0.5 * fn);
  col = mix(col, vec3(0.30, 0.34, 0.33), clamp(foam, 0.0, 1.0) * 0.3);

  // hull foam: a thin soft ring hugging each hull — no wakes, anchored
  for (int i = 0; i < ${MAX_HULLS}; i++) {
    if (i >= uHullCount) break;
    vec4 hp = uHullPos[i];
    vec2 d = vWorld.xz - hp.xy;
    vec2 fw = vec2(hp.z, hp.w);
    vec2 sd = vec2(-fw.y, fw.x);
    float par = dot(d, fw) / max(uHullSize[i].x, 0.001);
    float per = dot(d, sd) / max(uHullSize[i].y, 0.001);
    float e = par * par + per * per;                       // 1 = hull outline
    float ring = smoothstep(1.22, 1.06, e) * smoothstep(0.88, 1.0, e);
    col = mix(col, vec3(0.38, 0.42, 0.41), ring * 0.4 * (0.6 + 0.4 * fn));
  }

  // --- battle grids, drawn into the water so lines ride the swell ---
  float cell = 4.0;
  for (int g = 0; g < 2; g++) {
    vec2 mn = g == 0 ? uGridA : uGridB;
    float inside = inRect(vWorld.xz, mn, 40.0);
    if (inside > 0.0) {
      float dl = gridLine(vWorld.xz, mn, cell);
      float aa = fwidth(dl) + 1e-4;
      float cellLine = 1.0 - smoothstep(0.02, 0.02 + aa * 1.6, dl);
      float de = abs(gridEdge(vWorld.xz, mn, 40.0));
      float border = 1.0 - smoothstep(0.03, 0.03 + aa * 1.8, de);
      vec3 lineCol = vec3(0.55, 0.62, 0.62);
      col = mix(col, lineCol, cellLine * 0.22);
      col = mix(col, vec3(0.62, 0.66, 0.62), border * 0.55);
    }
  }

  // hovered enemy cell glow — subtle sea-green wash inside the cell
  if (uHover.z > 0.5) {
    vec2 hc = abs(vWorld.xz - uHover.xy);
    float m = (1.0 - smoothstep(1.2, 1.9, max(hc.x, hc.y)));
    col += vec3(0.05, 0.14, 0.10) * m;
  }

  // cooler mist over enemy waters — fog of war, never hides the grid
  float mistM = inRect(vWorld.xz, uGridB, 40.0);
  col = mix(col, uHazeColor * 1.35, mistM * 0.16);

  // distance haze into the horizon
  float d = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, uHazeColor, smoothstep(90.0, 480.0, d));

  gl_FragColor = vec4(col, 1.0); // linear out — OutputPass converts once
}
`;

export function createBoardOcean(size = 1400) {
  const geo = new PlaneGeometry(size, size, 300, 300);
  geo.rotateX(-Math.PI / 2);
  const mat = new ShaderMaterial({
    vertexShader: VERT.replace("__GERSTNER__", gerstnerGLSL(BOARD_WAVES)),
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new Vector3(0.35, 0.45, 0.35) },
      uSkyColor: { value: new Vector3(0.1, 0.16, 0.2) },
      uHazeColor: { value: new Vector3(0.1, 0.15, 0.18) },
      uGridA: { value: new Vector2(-44, -20) },
      uGridB: { value: new Vector2(4, -20) },
      uHover: { value: new Vector4(0, 0, 0, 0) },
      uHullPos: {
        value: Array.from({ length: MAX_HULLS }, () => new Vector4(0, 0, 1, 0)),
      },
      uHullSize: {
        value: Array.from({ length: MAX_HULLS }, () => new Vector4(1, 1, 0, 0)),
      },
      uHullCount: { value: 0 },
      uNormalTex: { value: makeNormalTexture() },
    },
  });
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
