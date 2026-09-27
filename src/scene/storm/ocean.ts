import { Mesh, PlaneGeometry, ShaderMaterial } from "three";
import { STORM_WAVES } from "./waves";

/** GLSL for the Gerstner displacement + analytic normal, generated from STORM_WAVES. */
function gerstnerGLSL(): string {
  const lines = STORM_WAVES.map((w) => {
    const ph = `(${w.freq.toFixed(4)} * dot(vec2(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}), p.xz) + ${w.speed.toFixed(4)} * uTime)`;
    return `
      { float ph = ${ph};
        float s = sin(ph); float c = cos(ph);
        float wa = ${w.freq.toFixed(4)} * ${w.amp.toFixed(4)};
        dp.x += ${w.q.toFixed(4)} * ${w.amp.toFixed(4)} * ${w.dx.toFixed(4)} * c;
        dp.z += ${w.q.toFixed(4)} * ${w.amp.toFixed(4)} * ${w.dz.toFixed(4)} * c;
        dp.y += ${w.amp.toFixed(4)} * s;
        n.x -= ${w.dx.toFixed(4)} * wa * c;
        n.z -= ${w.dz.toFixed(4)} * wa * c;
        n.y -= ${w.q.toFixed(4)} * wa * s;
        crest += ${w.amp.toFixed(4)} * s;
        fold += ${w.q.toFixed(4)} * wa * s; }`;
  });
  return lines.join("\n");
}

const VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vCrest;
varying float vFold;   // Jacobian-style steepness: >0 means the surface folds
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  // swell flattens well before the far field: the horizon must stay a soft,
  // straight line — distant crests silhouetted against the sky read as land
  float fade = 1.0 - smoothstep(60.0, 180.0, length(p.xz - uCamPos.xz));
  vec3 dp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  float crest = 0.0;
  float fold = 0.0;
  ${gerstnerGLSL()}
  p += dp * fade;
  n = mix(vec3(0.0, 1.0, 0.0), n, fade);
  vNormal = normalize(n);
  vWorld = p;
  vCrest = crest * fade;
  vFold = fold * fade;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

// All colours are authored LINEAR; tonemapping/colorspace chunks apply once.
const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uMoonDir;    // direction to the low cloud-gap light (y ~0.12)
uniform vec3 uStrikePos;  // world position under the active bolt
uniform float uFlash;     // lightning intensity 0..1
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uHorizon;    // fog colour = horizon
varying vec3 vNormal;
varying vec3 vWorld;
varying float vCrest;
varying float vFold;

float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ // smooth value noise — no blocky cells
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);

  // high-frequency chop: normal-only detail so the swell keeps its shape
  float c1 = sin(vWorld.x * 1.7 + uTime * 2.2) * cos(vWorld.z * 1.9 - uTime * 1.7);
  float c2 = sin(vWorld.x * 3.1 - uTime * 3.1 + vWorld.z * 2.7);
  float c3 = sin(vWorld.x * 5.7 + vWorld.z * 4.3 - uTime * 4.4);
  // fine smooth jitter: facet-scale variation that makes glints twinkle
  float j1 = vnoise(vWorld.xz * 9.0 + uTime * 1.5) - 0.5;
  float j2 = vnoise(vWorld.xz * 9.0 + vec2(31.7, 17.3) - uTime * 1.2) - 0.5;
  N = normalize(N + vec3(c1 + 0.6 * c3 + j1, 0.0, c2 + 0.5 * c3 + j2) * 0.16);

  vec3 deep = vec3(0.0005, 0.0011, 0.0022);
  vec3 skyRef = vec3(0.0012, 0.0020, 0.0028);   // a storm sky is nearly black
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = mix(deep, skyRef, fres);

  // --- the moonlit path: tight facet-driven gloss + sparkle glints ---
  vec3 L = normalize(uMoonDir);
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  // gate by azimuth so highlights form a path column between camera & light
  float azim = pow(max(dot(normalize(V.xz), normalize(vec2(-L.x, -L.z))), 0.0), 10.0);
  float gate = 0.12 + 0.88 * azim;
  // broken-highlight mask: the path shimmers in patches, like the reference
  float mask = 0.30 + 0.70 * vnoise(vWorld.xz * 1.8 + vec2(0.0, uTime * 0.7));
  float path_ = pow(ndh, 45.0) * 0.55 * gate * mask;           // facet-driven streak
  float glint = pow(ndh, 300.0) * (0.4 + 0.6 * hash21(vWorld.xz)) * 3.0 * gate * mask;
  col += vec3(0.62, 0.72, 0.88) * (path_ + glint);
  // slopes turned toward the gap catch its light — this is what makes the
  // swells read as shapes rather than a flat black field
  float face = pow(max(dot(N, normalize(vec3(L.x, 0.5, L.z))), 0.0), 2.0);
  col += vec3(0.006, 0.009, 0.012) * face;

  // --- lightning: directional, crests toward the strike light up ---
  vec3 toStrike = normalize(uStrikePos - vWorld);
  vec3 Hs = normalize(toStrike + V);
  float fs = pow(max(dot(N, Hs), 0.0), 90.0);
  float facing = max(dot(normalize(N.xz + vec2(1e-4)), normalize(toStrike.xz)), 0.0);
  fs *= 0.35 + 0.65 * facing;
  col += vec3(0.50, 0.60, 0.82) * fs * uFlash * 2.2;

  // --- foam & whitecaps on the steepest folds ---
  // (vFold tops out ~0.38; crest sum ~7.9 — thresholds tuned to real ranges)
  float foamN = hash21(floor(vWorld.xz * 3.0) + floor(uTime * 2.0));
  float foam = smoothstep(0.18, 0.38, vFold) * (0.55 + 0.45 * foamN)
             + smoothstep(1.6, 3.0, vCrest) * 0.5;
  foam = clamp(foam, 0.0, 1.0);
  col = mix(col, vec3(0.10, 0.13, 0.15), foam * 0.7);
  // subsurface teal: thin crests transmit light when you look toward it
  float subsurf = pow(max(dot(V, L), 0.0), 5.0);
  col += vec3(0.0, 0.012, 0.014) * subsurf * foam;
  col += uFlash * vec3(0.08, 0.10, 0.13) * foam * 0.7;   // foam catches the flash

  // --- global flash lift: capped small so troughs stay black ---
  col += uFlash * vec3(0.0012, 0.0018, 0.0026);

  // distance fade to the horizon — plane edge is far beyond full fade
  float d = length(vWorld.xz - uCamPos.xz);
  float f = smoothstep(60.0, 340.0, d);
  col = mix(col, uHorizon, f);

  gl_FragColor = vec4(col, 1.0); // linear out — OutputPass converts once
}
`;

export const OCEAN_HORIZON = { x: 0.0018, y: 0.0032, z: 0.0045 };

/** Low cloud-gap light: ~20° over the horizon, nearly dead ahead. */
export const MOON_DIR = { x: 0.12, y: 0.35, z: -0.93 };

export function createOcean(): { mesh: Mesh; material: ShaderMaterial } {
  const geometry = new PlaneGeometry(900, 900, 240, 240);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uMoonDir: { value: { ...MOON_DIR } },
      uStrikePos: { value: { x: 0, y: 60, z: -240 } },
      uFlash: { value: 0 },
      uCamPos: { value: { x: 0, y: 3.8, z: 26 } },
      uHorizon: { value: { ...OCEAN_HORIZON } },
    },
  });
  return { mesh: new Mesh(geometry, material), material };
}
