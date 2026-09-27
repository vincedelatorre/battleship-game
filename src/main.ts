import { createStormScene } from "./scene/storm/stormScene";
import { createStormAmbience } from "./audio/storm";
import { createMenu } from "./ui/menu/menu";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("missing #scene canvas");
}

const scene = createStormScene(canvas);
const ambience = createStormAmbience();
const menu = createMenu(document.body, {
  ambience,
  setQuality: (q) => scene.setQuality(q),
  setReducedMotion: (on) => scene.setReducedMotion(on),
});

scene.onLightning((e) => {
  menu.onLightning(e);
  ambience.onLightning(e);
});

// Debug/screenshot hook: `?debug=strike` also auto-strikes every 4 s.
const dbg = new URLSearchParams(window.location.search);
if (dbg.get("debug") === "strike" || dbg.has("strike")) {
  (window as unknown as { __storm: { strike(i?: number): void } }).__storm =
    scene;
}
