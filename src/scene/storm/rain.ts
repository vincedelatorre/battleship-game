import {
  BufferGeometry,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
} from "three";

export const RAIN_HIGH = 4000;
export const RAIN_LOW = 1500;

/**
 * Rain streaks as an InstancedMesh of thin quads. Per-instance seeds drive
 * all placement in the vertex shader — the drops wrap through a volume
 * around the camera, falling with the wind — so zero CPU work per frame.
 */
export function createRain(count = RAIN_HIGH): {
  mesh: InstancedMesh;
  setDensity: (n: number) => void;
} {
  const quad = new PlaneGeometry(0.02, 1.4);
  const geo = new BufferGeometry();
  geo.index = quad.index;
  geo.setAttribute("position", quad.attributes.position!);
  geo.setAttribute("uv", quad.attributes.uv!);
  geo.setAttribute(
    "aSeed",
    new InstancedBufferAttribute(
      Float32Array.from({ length: count * 4 }, () => Math.random()),
      4,
    ),
  );

  const material = new MeshBasicMaterial({
    color: 0x8fa8bb,
    transparent: true,
    opacity: 0.16,
    side: DoubleSide,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uCamXZ = { value: { x: 0, y: 26 } };
    material.userData.shader = shader;
    shader.vertexShader =
      `
      uniform float uTime;
      uniform vec2 uCamXZ;
      attribute vec4 aSeed;
    ` + shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      {
        vec3 volume = vec3(70.0, 45.0, 70.0);
        vec3 vel = vec3(9.0, -34.0, 5.0);        // wind-driven fall
        vec3 base = aSeed.xyz * volume;
        vec3 p0 = mod(base + vel * uTime, volume) - volume * 0.5;
        // keep a clear cylinder around the camera — a drop within a few
        // units would smear across the whole frame as a giant streak
        vec2 away = p0.xz - uCamXZ;
        float r = length(away);
        if (r < 7.0) p0.xz += (away / max(r, 0.01)) * (7.0 - r);
        vec3 dir = normalize(vel);
        transformed = p0 + dir * (position.y * (1.0 + aSeed.w))
                    + vec3(position.x, 0.0, 0.0);
      }`,
      );
  };

  const mesh = new InstancedMesh(geo, material, count);
  mesh.frustumCulled = false;
  const identity = new Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, identity);
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,
    setDensity(n: number) {
      mesh.count = Math.min(n, count);
    },
  };
}

/** Advance the rain shader clock (call each frame). */
export function tickRain(mesh: InstancedMesh, t: number): void {
  const mat = mesh.material as MeshBasicMaterial;
  const shader = mat.userData.shader as
    | { uniforms?: { uTime?: { value: number } } }
    | undefined;
  if (shader?.uniforms?.uTime) shader.uniforms.uTime.value = t;
}
