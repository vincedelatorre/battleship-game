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
  { dx: -0.3, dz: 0.95, amp: 0.5, freq: 0.045, speed: 0.5, q: 0.35 },
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
varying vec3 vNormal;
varying vec3 vWorld;
varying float vCrest;
varying float vFold;
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  // swell flattens in the far field so the horizon stays a clean line
  float fade = 1.0 - smoothstep(150.0, 420.0, length(p.xz - cameraPosition.xz));
  vec3 dp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float crest = 0.0;
  float fold = 0.0;
  ${"" /* GLSL generated below */}
  __GERSTNER__
  float k = fade;
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

float inRect(vec2 p, vec2 mn, float sz) {
  return step(mn.x, p.x) * step(mn.y, p.y) * step(p.x, mn.x + sz) * step(p.y, mn.y + sz);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);

  // fragment micro-facets: two scrolling taps of the filtered normal map
  vec3 t1 = texture2D(uNormalTex, vWorld.xz * 0.09 + vec2(uTime * 0.012, uTime * 0.007)).rgb * 2.0 - 1.0;
  vec3 t2 = texture2D(uNormalTex, vWorld.xz * 0.26 - vec2(uTime * 0.016, -uTime * 0.010)).rgb * 2.0 - 1.0;
  vec3 t3 = texture2D(uNormalTex, vWorld.xz * 0.55 + vec2(-uTime * 0.011, uTime * 0.014)).rgb * 2.0 - 1.0;
  N = normalize(N + vec3(t1.x + t2.x + t3.x * 0.7, 0.0, t1.y + t2.y + t3.y * 0.7) * 0.16);

  vec3 deep = vec3(0.0036, 0.020, 0.067);    // #0b2748 in linear
  vec3 surf = vec3(0.011, 0.082, 0.236);     // #1a4f86 in linear

  // slow large-scale depth variation + a drifting cloud shadow
  float depthN = vnoise(vWorld.xz * 0.022 + vec2(uTime * 0.011, 0.0));
  float cloud = vnoise(vWorld.xz * 0.009 - vec2(uTime * 0.006, uTime * 0.004));

  vec3 L = normalize(uSunDir);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.5);
  vec3 base = mix(deep, surf, 0.38 + 0.18 * depthN);
  vec3 col = mix(base, mix(surf, uSkyColor, fres * 0.7), 0.45 + 0.4 * fres);
  // sunlit swell: bright faces toward the light, darker troughs/lees
  float lit = clamp(dot(N, L), 0.0, 1.0);
  col *= 0.78 + 0.42 * lit + 0.09 * vCrest;
  // large-scale patches, ~±8% luminance, drifting slowly
  col *= 0.96 + 0.08 * depthN;
  col *= 1.0 - 0.10 * smoothstep(0.55, 0.9, cloud);   // cloud shadow drift
  col = mix(col, surf * 1.08, smoothstep(0.4, 1.4, vCrest) * 0.25);

  // sun: smooth glossy lobe + sparse smooth sparkles
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  // twinkle comes free from the perturbed normals — no hash gate
  float glit = pow(ndh, 750.0) * 1.5;
  col += vec3(1.0, 0.86, 0.6) * glit;
  col += vec3(0.9, 0.75, 0.5) * pow(ndh, 60.0) * 0.055; // soft glossy path

  // subsurface teal on thin crests facing the light
  float subs = pow(max(dot(V, L), 0.0), 4.0);
  col += vec3(0.0, 0.035, 0.09) * subs * smoothstep(0.2, 1.0, vCrest);

  // fine crest foam only — smooth noise, kept subtle
  float fn = vnoise(vWorld.xz * 1.7 + vec2(uTime * 0.3, -uTime * 0.2));
  float foam = smoothstep(0.16, 0.30, vFold) * (0.3 + 0.5 * fn);
  col = mix(col, vec3(0.30, 0.34, 0.33), clamp(foam, 0.0, 1.0) * 0.3);

  // waterline: darker water under each hull + a thin bright rim that
  // pulses gently — sells the hull sitting in the water
  for (int i = 0; i < ${MAX_HULLS}; i++) {
    if (i >= uHullCount) break;
    vec4 hp = uHullPos[i];
    vec2 d = vWorld.xz - hp.xy;
    vec2 fw = vec2(hp.z, hp.w);
    vec2 sd = vec2(-fw.y, fw.x);
    float par = dot(d, fw) / max(uHullSize[i].x, 0.001);
    float per = dot(d, sd) / max(uHullSize[i].y, 0.001);
    float e = par * par + per * per;                       // 1 = hull outline
    float under = smoothstep(1.05, 0.6, e);                // inside the hull
    col *= 1.0 - 0.26 * under;
    // dark contact band hugging the hull edge (~0.15u)
    float band = smoothstep(1.0, 0.88, e) * smoothstep(0.68, 0.86, e);
    col *= 1.0 - 0.35 * band;
    // thin bright foam just outside the outline, pulsing gently
    float rim = smoothstep(1.22, 1.08, e) * smoothstep(1.0, 1.05, e);
    float pulse = 0.7 + 0.3 * sin(uTime * 1.7 + hp.x * 1.3 + hp.y);
    col = mix(col, vec3(0.55, 0.66, 0.78), rim * 0.6 * pulse * (0.7 + 0.3 * fn));
  }

  // unknown waters: a cool darkening + drifting fog, under the grid lines
  float mistM = inRect(vWorld.xz, uGridB, 40.0);
  float fogN = vnoise(vWorld.xz * 0.045 - vec2(uTime * 0.018, uTime * 0.012));
  vec3 mistCol = vec3(0.0127, 0.037, 0.083); // #1c3550 in linear
  col = mix(col, mistCol, mistM * (0.09 + 0.05 * fogN));

  // (grid lines + hover live on the static overlay — water moves freely)

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
