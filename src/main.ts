import { createSmokeScene } from "./scene/smokeScene";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("missing #scene canvas");
}

createSmokeScene(canvas);
