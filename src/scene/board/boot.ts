import { parseLabel } from "../../engine/coords";
import { pickCaptain } from "../../ai/captain";
import { mulberry32 } from "../../engine/rng";
import { createBoardScene } from "./boardScene";
import { captainColor } from "./ships";
import { createHud } from "../../ui/battle/hud";
import { createSidebars } from "../../ui/battle/sidebar";
import { createSession, type Session } from "../../ui/battle/session";
import { shipCells, type Placement } from "../../engine/index";
import { loadConfig, type MatchConfig } from "../../ui/config";

/**
 * Boots the battle board: HUD sidebar + scene + session (placement, then
 * battle). The scene never sees the enemy fleet until the engine reports a sink.
 */
export async function startBoard(
  canvas: HTMLCanvasElement,
  opts: { debug?: boolean; config?: MatchConfig } = {},
): Promise<void> {
  const config = opts.config ?? loadConfig();
  const rng = mulberry32(Date.now() >>> 0);
  const aiCaptain = pickCaptain(rng, config.captain); // always a different colour
  const colors = [captainColor(config.captain), captainColor(aiCaptain)] as const;

  // the sidebar goes in first so the canvas is already its final size
  let session: Session | null = null;
  const hud = createHud(
    document.body,
    {
      captains: [config.captain, aiCaptain],
      gambitMode: config.mode === "gambit",
      onSelectShip: (id) => session?.selectShip(id),
      onRotate: () => session?.rotate(),
      onRandomize: () => session?.randomize(),
      onClear: () => session?.clear(),
      onStart: () => session?.start(),
      onGambit: () => session?.gambit(),
    },
    colors,
  );
  // wraps the canvas in the 3-column stage and moves hud's `.sb` into the
  // left column — must run before the scene measures the canvas
  const sidebar = createSidebars(canvas, {
    ownCaptain: config.captain,
    enemyCaptain: aiCaptain,
    gambit: config.mode === "gambit",
  });
  const scene = await createBoardScene(canvas);
  scene.setFleetColors(colors[0], colors[1]);

  // deterministic debug fleet: every class in both orientations
  // (player V,H,V,H,V — enemy H,V,H,V,H). `?fleet=test` only; skips placement.
  const fleets = new URLSearchParams(location.search).get("fleet") === "test"
    ? ([
        [
          { id: "carrier", row: 1, col: 1, orientation: "V" },
          { id: "battleship", row: 7, col: 3, orientation: "H" },
          { id: "cruiser", row: 0, col: 8, orientation: "V" },
          { id: "submarine", row: 4, col: 4, orientation: "H" },
          { id: "destroyer", row: 8, col: 9, orientation: "V" },
        ],
        [
          { id: "carrier", row: 1, col: 1, orientation: "H" },
          { id: "battleship", row: 0, col: 8, orientation: "V" },
          { id: "cruiser", row: 5, col: 2, orientation: "H" },
          { id: "submarine", row: 6, col: 5, orientation: "V" },
          { id: "destroyer", row: 9, col: 7, orientation: "H" },
        ],
      ] as readonly [readonly Placement[], readonly Placement[]])
    : undefined;

  session = createSession({
    scene,
    hud,
    sidebar,
    rng,
    difficulty: config.difficulty,
    captains: [config.captain, aiCaptain],
    gambit: config.mode === "gambit",
    debug: opts.debug,
    ...(fleets ? { fleets } : {}),
  });
  if (new URLSearchParams(location.search).get("debug")?.includes("cells")) {
    scene.showCells();
  }

  if (opts.debug) {
    const ctrl = () => session!.controller();
    (window as unknown as Record<string, unknown>).__scene = scene;
    (window as unknown as Record<string, unknown>).__session = session;
    (window as unknown as Record<string, unknown>).__board = {
      focus: (w: "own" | "enemy" | "all") => scene.focus(w),
      project: (x: number, y: number, z: number) => scene.project(x, y, z),
      pitch: (d: number, dist?: number) => scene.pitchAt(d, dist),
      autoPlace: () => session!.autoPlace(),
      place: (id: Parameters<Session["debugPlace"]>[0], label: string, orient?: "H" | "V") => {
        const c = parseLabel(label);
        if (c) session!.debugPlace(id, c, orient);
      },
      hoverAt: (label: string | null) =>
        session!.debugHover(label ? parseLabel(label) : null),
      fireAt: (label: string) => {
        const c = parseLabel(label);
        return c ? (ctrl()?.fireAt(c) ?? false) : false;
      },
      fleet: () => ctrl()?.enemyFleet() ?? [],
      state: () => ctrl()?.state(),
      // sinks every enemy ship so all revealed wrecks can be checked
      sinkAll: () => {
        for (const pl of ctrl()?.enemyFleet() ?? []) {
          const cells = shipCells(pl);
          for (const [i, c] of cells.entries()) {
            scene.applyShot("enemy", {
              coord: { row: c.row, col: c.col },
              result: i === cells.length - 1 ? "sunk" : "hit",
              shipId: i === cells.length - 1 ? pl.id : undefined,
            });
          }
          scene.revealShip(pl);
        }
      },
    };
  }
}
