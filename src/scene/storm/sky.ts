import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from "three";
import { MOON_DIR, OCEAN_HORIZON } from "./ocean";

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

// Linear-authored colours; tonemapping/colorspace chunks apply once.
const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uFlash;
uniform vec3 uStrike;   // unit direction toward the active strike
uniform vec3 uGapDir;   // direction of the cloud-gap light (moon path source)
uniform vec3 uFog;      // horizon colour — lower hemisphere melts into it
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.55; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  vec2 uv = d.xz / (0.35 + abs(d.y)) * 1.4;
  float t = uTime * 0.012;
  float c = fbm(uv + vec2(t, t * 0.6));
  float c2 = fbm(uv * 2.3 - vec2(t * 1.4, 0.0));

  vec3 base = mix(vec3(0.0008, 0.0016, 0.0032), vec3(0.0040, 0.0065, 0.0090), c);
  base = mix(base, vec3(0.0004, 0.0008, 0.0015), smoothstep(0.45, 0.8, c2) * 0.8);

  // the cloud gap: a brightened break around the moon direction that feeds
  // the water's reflection path
  float gap = pow(max(dot(d, uGapDir), 0.0), 14.0);
  base += vec3(0.040, 0.055, 0.070) * gap;

  // faint teal rim extending along the horizon from the gap azimuth
  float az = dot(normalize(d.xz + vec2(1e-5)), normalize(uGapDir.xz));
  float band = smoothstep(0.25, 0.02, abs(d.y)) * smoothstep(0.0, 0.9, az);
  base += vec3(0.0012, 0.0070, 0.0070) * band;

  // lightning: the cloud base blooms around the strike azimuth — LOCAL.
  float nearStrike = pow(max(dot(d, uStrike), 0.0), 14.0);
  base += uFlash * nearStrike * vec3(0.22, 0.30, 0.46);
  // a whisper of global lift only (~20%), so fog and sky never wash flat
  base += uFlash * (0.015 + 0.06 * c) * vec3(0.30, 0.38, 0.55);

  base += vec3(0.0004, 0.0006, 0.0010) * smoothstep(0.0, 0.8, d.y);

  // thin mist band hugging the horizon — softens the sea/sky join for good,
  // even mid-flash (applied after the flash terms on purpose)
  float mist = smoothstep(0.13, 0.015, abs(d.y));
  base = mix(base, uFog * 2.4 + vec3(0.002, 0.003, 0.004), mist * 0.75);
  // below the horizon line the sky melts fully into the fog colour
  base = mix(uFog, base, smoothstep(-0.06, 0.03, d.y));

  gl_FragColor = vec4(base, 1.0); // linear out — OutputPass converts once
}
`;

export function createSky(): { mesh: Mesh; material: ShaderMaterial } {
  // big enough that the ocean plane (900u) can never poke past it
  const geometry = new SphereGeometry(1200, 32, 20);
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uStrike: { value: { x: 0, y: 0.15, z: -1 } },
      uGapDir: { value: { ...MOON_DIR } },
      uFog: { value: { ...OCEAN_HORIZON } },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}
