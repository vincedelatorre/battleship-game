import {
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";

const OCEAN_DEEP = 0x06121f;
const OCEAN_SURFACE = 0x0a2e4a;

/** Minimal three.js smoke scene: a sine-wave ocean plane under an RTS-style camera. */
export function createSmokeScene(canvas: HTMLCanvasElement): () => void {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new Scene();
  scene.background = new Color(OCEAN_DEEP);
  scene.fog = new Fog(OCEAN_DEEP, 60, 240);

  const camera = new PerspectiveCamera(50, 1, 0.1, 600);
  // ~55° below horizontal: height 60 over 42 of forward distance (tan 55° ≈ 1.43).
  camera.position.set(0, 60, 42);
  camera.lookAt(0, 0, 0);

  const geometry = new PlaneGeometry(200, 200, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshStandardMaterial({
    color: OCEAN_SURFACE,
    roughness: 0.85,
    metalness: 0.1,
  });
  const ocean = new Mesh(geometry, material);
  scene.add(ocean);

  const sky = new HemisphereLight(0xbcd8ff, 0x04263f, 0.9);
  scene.add(sky);
  const sun = new DirectionalLight(0xfff1d6, 1.4);
  sun.position.set(40, 80, -30);
  scene.add(sun);

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  const positions = geometry.attributes.position;
  if (!positions) {
    throw new Error("ocean geometry is missing its position attribute");
  }
  const clock = new Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(
        i,
        Math.sin(x * 0.12 + t * 1.1) * 0.9 + Math.cos(z * 0.09 + t * 0.7) * 0.7,
      );
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    window.removeEventListener("resize", resize);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
}
