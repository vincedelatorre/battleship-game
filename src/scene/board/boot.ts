import { parseLabel } from "../../engine/coords";
import { pickCaptain } from "../../ai/captain";
import { mulberry32 } from "../../engine/rng";
import { createBoardScene, type BoardView } from "./boardScene";
import { captainColor } from "./ships";
import { createBattleController } from "../../ui/battle/controller";
import { createHud } from "../../ui/battle/hud";
import { shipCells, type Placement } from "../../engine/index";

/**
 * Boots the battle board: scene + controller + HUD, wired together.
 * The scene never sees the enemy fleet until the engine reports a sink.
 */
export async function startBoard(
  canvas: HTMLCanvasElement,
  opts: { debug?: boolean } = {},
): Promise<void> {
  const scene = await createBoardScene(canvas);
  const hud = createHud(document.body);

  const rng = mulberry32(Date.now() >>> 0);
  const aiCaptain = pickCaptain(rng); // player is blue until captain select
  (scene as unknown as { setFleetColors(a: "blue" | "red" | "green" | "black", b: "blue" | "red" | "green" | "black"): void })
    .setFleetColors("blue", captainColor(aiCaptain) === "blue" ? "red" : captainColor(aiCaptain));

  const view: BoardView & { banner(t: string): void; gameOver(w: number): void } = {
    ...scene,
    banner: (t) => hud.banner(t),
    gameOver: (w) => hud.gameOver(w === 0),
  };

  // deterministic debug fleet: every class in both orientations
  // (player V,H,V,H,V — enemy H,V,H,V,H). `?fleet=test` only.
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

  const ctrl = createBattleController({ view, rng, debug: opts.debug, fleets });
  if (new URLSearchParams(location.search).get("debug")?.includes("cells")) {
    scene.showCells();
  }
  scene.onHover((c) => ctrl.hover(c));
  scene.onFire((c) => ctrl.fireAt(c));

  if (opts.debug) {
    (window as unknown as Record<string, unknown>).__board = {
      focus: (w: "own" | "enemy" | "all") => scene.focus(w),
      fireAt: (label: string) => {
        const c = parseLabel(label);
        return c ? ctrl.fireAt(c) : false;
      },
      fleet: () => ctrl.enemyFleet(),
      state: () => ctrl.state(),
      // sinks every enemy ship so all revealed wrecks can be checked
      sinkAll: () => {
        for (const pl of ctrl.enemyFleet()) {
          const cells = shipCells(pl);
          for (const [i, c] of cells.entries()) {
            view.applyShot("enemy", {
              coord: { row: c.row, col: c.col },
              result: i === cells.length - 1 ? "sunk" : "hit",
              shipId: i === cells.length - 1 ? pl.id : undefined,
            });
          }
          view.revealShip(pl);
        }
      },
    };
  }
}
