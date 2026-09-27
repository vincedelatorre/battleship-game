import { createStormScene, type StormScene } from "./scene/storm/stormScene";
import { createStormAmbience, type AmbienceController } from "./audio/storm";
import { createMenu, type MenuHandles } from "./ui/menu/menu";
import { createSetup, type SetupHandles } from "./ui/menu/setup";
import { loadConfig, type MatchConfig } from "./ui/config";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) {
  throw new Error("missing #scene canvas");
}
const params = new URLSearchParams(window.location.search);

async function bootBoard(config: MatchConfig) {
  const mod = await import("./scene/board/boot");
  await mod.startBoard(canvas!, { debug: params.has("debug"), config });
}

function fadeToBlack(): { done: Promise<void>; lift(): void } {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;inset:0;background:#000;opacity:0;z-index:50;transition:opacity .45s";
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = "1"));
  return {
    done: new Promise((r) => window.setTimeout(r, 500)),
    lift() {
      el.style.opacity = "0";
      window.setTimeout(() => el.remove(), 500);
    },
  };
}

let scene: StormScene | null = null;
let ambience: AmbienceController | null = null;
let menu: MenuHandles | null = null;
let setup: SetupHandles | null = null;
let sailing = false;

async function setSail(config: MatchConfig) {
  if (sailing) return;
  sailing = true;
  const fade = fadeToBlack();
  await fade.done;
  setup?.dispose();
  menu?.dispose();
  scene?.dispose();
  ambience?.stop();
  setup = null;
  menu = null;
  scene = null;
  ambience = null;
  await bootBoard(config);
  fade.lift();
}

function openSetup() {
  if (setup) return;
  menu?.setAway(true);
  setup = createSetup(document.body, {
    onBack() {
      setup?.dispose();
      setup = null;
      menu?.setAway(false);
    },
    onDone: (cfg) => void setSail(cfg),
  });
}

if (params.get("scene") === "board") {
  void bootBoard(loadConfig());
} else {
  scene = createStormScene(canvas);
  ambience = createStormAmbience();
  menu = createMenu(document.body, {
    ambience,
    setQuality: (q) => scene?.setQuality(q),
    setReducedMotion: (on) => scene?.setReducedMotion(on),
    onSail: openSetup,
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
  if (params.get("setup") === "1") openSetup();
}
