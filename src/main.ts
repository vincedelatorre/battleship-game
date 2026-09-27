import { createStormScene, type StormScene } from "./scene/storm/stormScene";
import { createStormAmbience, type AmbienceController } from "./audio/storm";
import { createMenu, type MenuHandles } from "./ui/menu/menu";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("missing #scene canvas");
}
const params = new URLSearchParams(window.location.search);

async function bootBoard() {
  const mod = await import("./scene/board/boot");
  await mod.startBoard(canvas!, { debug: params.has("debug") });
}

function fadeToBlack(): Promise<void> {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;inset:0;background:#000;opacity:0;z-index:50;transition:opacity .45s";
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = "1"));
  return new Promise((r) => window.setTimeout(r, 500));
}

let scene: StormScene | null = null;
let ambience: AmbienceController | null = null;
let menu: MenuHandles | null = null;
let sailing = false;

async function setSail() {
  if (sailing) return;
  sailing = true;
  await fadeToBlack();
  menu?.dispose();
  scene?.dispose();
  ambience?.stop();
  menu = null;
  scene = null;
  ambience = null;
  // drop the fade once the board is mounted
  await bootBoard();
  document.querySelector("div[style*='z-index: 50']")?.remove();
}

if (params.get("scene") === "board") {
  void bootBoard();
} else {
  scene = createStormScene(canvas);
  ambience = createStormAmbience();
  menu = createMenu(document.body, {
    ambience,
    setQuality: (q) => scene?.setQuality(q),
    setReducedMotion: (on) => scene?.setReducedMotion(on),
    onSail: setSail,
  });

  scene.onLightning((e) => {
    menu?.onLightning(e);
    ambience?.onLightning(e);
  });

  // Debug/screenshot hook: `?debug=strike` also auto-strikes every 4 s.
  if (params.get("debug") === "strike" || params.has("strike")) {
    (window as unknown as { __storm: { strike(i?: number): void } }).__storm =
      scene;
  }
}
