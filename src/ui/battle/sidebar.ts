import type { Coord, Placement } from "../../engine/index";
import { shipCells } from "../../engine/index";
import { captainProfile } from "../captains";
import type { CaptainId } from "../../engine/captains";
import { injectTheme } from "../theme";
import type { SidebarModel } from "./sidebarModel";

/**
 * Two-sidebar battle layout around the 3D canvas (mockup: dark navy panels,
 * thin brass borders). The left column hosts hud.ts's `.sb` sidebar
 * (captain card, muster dock, fleet manifest) plus the "Your waters" chart
 * and the battle tally this module adds; the right column hosts the enemy
 * captain card + fleet (moved out of `.sb`) and the Captain's log.
 * Under 1000 px the columns become slide-in drawers.
 */

const CSS = /* css */ `
.pb-stage{position:fixed;inset:0;display:grid;grid-template-columns:288px minmax(0,1fr) 288px}
body.pb-battle .pb-stage > #scene{position:static;left:auto;width:100%;height:100%;min-width:0;min-height:0}
.pb-left{position:relative;min-width:0;min-height:0}
.pb-right{box-sizing:border-box;position:relative;overflow-y:auto;overflow-x:hidden;padding:12px;display:flex;
  flex-direction:column;gap:12px;min-width:0;min-height:0;
  font-family:var(--pb-sans);color:var(--pb-ink);
  background:linear-gradient(270deg,rgba(0,0,0,0) 94%,rgba(0,0,0,.45)),
    repeating-linear-gradient(0deg,rgba(255,255,255,.012) 0 3px,rgba(0,0,0,.02) 3px 7px),
    linear-gradient(180deg,#1b2330,#10151d 60%,#0c1117);
  border-left:2px solid var(--pb-brass);box-shadow:-6px 0 24px rgba(0,0,0,.5)}
.pb-left .sb{position:absolute;inset:0;width:auto;height:auto;overflow-y:auto;border-right:0;border-top:0}
.pb-right .sb-sec{flex:none}
.pb-right h3{margin:0 0 6px;font:700 11px var(--pb-sans);letter-spacing:.22em;text-transform:uppercase;
  color:#8fa5b0;display:flex;justify-content:space-between;align-items:baseline}
body.pb-battle .pb-hud{left:288px;right:288px}
.sb-bio{margin:0;padding:6px 10px 8px;font:italic 12px/1.4 var(--pb-serif);color:#d9cba8;
  border-top:1px solid rgba(176,141,87,.25)}
.cap.mini .sb-bio{grid-column:1/-1}
.sb-gline{padding:4px 10px;font:700 11px var(--pb-sans);letter-spacing:.12em;text-transform:uppercase;
  color:#f0c96a;background:rgba(20,26,36,.9);border-top:1px solid rgba(176,141,87,.4)}

/* --- Your waters mini chart --- */
.waters{display:grid;grid-template-columns:14px repeat(10,minmax(0,1fr));gap:1px;
  font:600 8px var(--pb-sans)}
.waters .wlab{display:flex;align-items:center;justify-content:center;color:#b8a77f;
  letter-spacing:0;height:14px}
.waters .wc{position:relative;aspect-ratio:1;background:rgba(80,140,160,.13);
  border:1px solid rgba(176,141,87,.18);border-radius:1px}
.waters .wc.ship{background:#4a3322;border-color:rgba(176,141,87,.75)}
.waters .wc.hit::before,.waters .wc.hit::after{content:"";position:absolute;
  left:8%;right:8%;top:44%;height:2px;background:#e0582a}
.waters .wc.hit::before{transform:rotate(45deg)}
.waters .wc.hit::after{transform:rotate(-45deg)}
.waters .wc.miss::after{content:"";position:absolute;inset:20%;
  border:1.5px solid #e8e4d8;border-radius:50%}

/* --- battle tally --- */
.pb-stats{display:flex;flex-direction:column;gap:3px;font:12px var(--pb-sans)}
.pb-stats>div{display:flex;justify-content:space-between;gap:8px}
.pb-stats span{color:var(--pb-ink-dim)}
.pb-stats b{color:var(--pb-ink);font-weight:600}

/* --- Captain's log --- */
.pb-logsec{display:flex;flex-direction:column;min-height:0;flex:1}
.pb-log{margin:0;padding:0;list-style:none;overflow-y:auto;min-height:80px;flex:1;
  font:12.5px/1.5 var(--pb-serif);color:#e9dcbc}
.pb-log li{padding:5px 2px;border-bottom:1px dashed rgba(176,141,87,.25)}
.pb-log li:first-child{color:#fff2d8}

/* --- drawers < 1000px --- */
.pb-drawer{display:none;position:fixed;top:56px;z-index:20;cursor:pointer;
  font:700 12px var(--pb-sans);letter-spacing:.14em;text-transform:uppercase;
  padding:8px 12px;color:#241708;border:1px solid #6b4e2a;border-radius:5px;
  background:linear-gradient(180deg,#caa25f,#a37b3f);box-shadow:0 4px 14px rgba(0,0,0,.5)}
.pb-drawer.l{left:8px}
.pb-drawer.r{right:8px}
.pb-banner{transition:opacity .15s ease}
@media (max-width:1000px){
  /* banner stays clear of the drawer buttons; open drawers sit over it */
  .pb-drawer{top:80px}
  body.pb-drawer-open .pb-banner{opacity:0;pointer-events:none}
  .pb-stage{grid-template-columns:minmax(0,1fr)}
  .pb-left,.pb-right{position:fixed;top:0;bottom:0;z-index:19;width:min(320px,86vw);
    padding:12px;transition:transform .28s ease;box-shadow:0 0 30px rgba(0,0,0,.65)}
  .pb-left{left:0;transform:translateX(-104%);
    background:linear-gradient(90deg,rgba(0,0,0,0) 94%,rgba(0,0,0,.45)),
      repeating-linear-gradient(0deg,rgba(255,255,255,.012) 0 3px,rgba(0,0,0,.02) 3px 7px),
      linear-gradient(180deg,#1b2330,#10151d 60%,#0c1117);
    border-right:2px solid var(--pb-brass)}
  .pb-right{right:0;transform:translateX(104%)}
  .pb-left.open,.pb-right.open{transform:none}
  .pb-drawer{display:inline-block}
  body.pb-battle .pb-hud{left:0;right:0}
}
`;

const ROW_LETTERS = "ABCDEFGHIJ";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface SidebarHandles {
  /** battle panels: mini chart + tally (fleet lists are hud's job) */
  update(model: SidebarModel): void;
  /** placement phase: redraw just the mini chart's own hulls */
  updateWaters(
    ownPlacements: readonly Placement[],
    hits?: readonly Coord[],
    misses?: readonly Coord[],
  ): void;
  /** prepend a Captain's-log line; capped at ~200, newest first */
  pushLog(text: string): void;
  dispose(): void;
}

export function createSidebars(
  canvas: HTMLCanvasElement,
  opts: { ownCaptain: CaptainId; enemyCaptain: CaptainId; gambit: boolean },
): SidebarHandles {
  injectTheme();
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  // --- grid stage: [left aside][canvas][right aside] ---
  const stage = el("div", "pb-stage");
  const left = el("aside", "pb-left");
  const right = el("aside", "pb-right");
  right.setAttribute("aria-label", "Enemy captain and captain's log");
  canvas.parentNode!.insertBefore(stage, canvas);
  stage.appendChild(canvas);
  stage.insertBefore(left, canvas);
  stage.appendChild(right);

  // hud.ts's sidebar becomes the left column's content
  const sb = document.querySelector<HTMLElement>("aside.sb");
  if (sb) {
    left.appendChild(sb);
    // spec's muster heading on the placement dock
    const dockH3 = sb.querySelector<HTMLElement>(".sb-dock h3");
    if (dockH3?.firstChild) dockH3.firstChild.textContent = "Muster yer fleet ";
    // "Gambit: <name>" line on the own captain card (gambit mode only)
    if (opts.gambit) {
      const ownCap = sb.querySelector<HTMLElement>(".sb-own .cap");
      if (ownCap && !ownCap.querySelector(".sb-gline")) {
        ownCap.appendChild(
          el(
            "div",
            "sb-gline",
            `Gambit: ${captainProfile(opts.ownCaptain).gambit.name}`,
          ),
        );
      }
    }
    // move enemy card + enemy fleet into the right column
    const enemyCard = sb.querySelector<HTMLElement>(".sb-enemy");
    const flEnemy = sb.querySelector<HTMLElement>(".fl-enemy");
    if (enemyCard) {
      const bio = el("p", "sb-bio", captainProfile(opts.enemyCaptain).bio);
      enemyCard.querySelector(".cap")?.appendChild(bio);
      right.appendChild(enemyCard);
    }
    if (flEnemy) right.appendChild(flEnemy);
  }

  // --- Your waters chart (injected into the left sidebar) ---
  const watersSec = el("section", "sb-sec sb-waters");
  watersSec.setAttribute("aria-label", "Your waters");
  watersSec.innerHTML = `<h3>Your waters</h3>`;
  const chart = el("div", "waters");
  chart.setAttribute("role", "img");
  chart.setAttribute(
    "aria-label",
    "Chart of your waters: your ships and enemy shots",
  );
  const cells: HTMLElement[] = [];
  chart.appendChild(el("span", "wlab"));
  for (let c = 1; c <= 10; c++) chart.appendChild(el("span", "wlab", String(c)));
  for (let r = 0; r < 10; r++) {
    chart.appendChild(el("span", "wlab", ROW_LETTERS[r]!));
    for (let c = 0; c < 10; c++) {
      const cell = el("span", "wc");
      cells.push(cell);
      chart.appendChild(cell);
    }
  }
  watersSec.appendChild(chart);

  const statsSec = el("section", "sb-sec");
  statsSec.setAttribute("aria-label", "Battle tally");
  statsSec.hidden = true; // populated once the battle starts
  statsSec.innerHTML = `<h3>Battle tally</h3><div class="pb-stats"></div>`;
  const statsEl = statsSec.querySelector<HTMLElement>(".pb-stats")!;

  if (sb) {
    const dock = sb.querySelector<HTMLElement>(".sb-dock");
    if (dock) dock.insertAdjacentElement("afterend", watersSec);
    else sb.appendChild(watersSec);
    sb.appendChild(statsSec);
  } else {
    left.appendChild(watersSec);
    left.appendChild(statsSec);
  }

  // --- Captain's log (right column) ---
  const logSec = el("section", "sb-sec pb-logsec");
  logSec.setAttribute("aria-label", "Captain's log");
  logSec.innerHTML = `<h3>Captain's log</h3>`;
  const logEl = el("ol", "pb-log");
  logEl.setAttribute("aria-live", "polite");
  logSec.appendChild(logEl);
  right.appendChild(logSec);

  // --- drawer buttons (mobile) ---
  left.id = "pb-left";
  right.id = "pb-right";
  const syncDrawerState = () =>
    document.body.classList.toggle(
      "pb-drawer-open",
      left.classList.contains("open") || right.classList.contains("open"),
    );
  const mkDrawer = (cls: string, label: string, panel: HTMLElement) => {
    const b = el("button", `pb-drawer ${cls}`, label);
    b.setAttribute("aria-controls", panel.id);
    b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", () => {
      const open = panel.classList.toggle("open");
      b.setAttribute("aria-expanded", String(open));
      syncDrawerState();
    });
    document.body.appendChild(b);
    return b;
  };
  const fleetBtn = mkDrawer("l", "Fleet", left);
  const logBtn = mkDrawer("r", "Log", right);
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    for (const [p, b] of [
      [left, fleetBtn],
      [right, logBtn],
    ] as const) {
      p.classList.remove("open");
      b.setAttribute("aria-expanded", "false");
    }
    syncDrawerState();
  };
  window.addEventListener("keydown", onEsc);

  function updateWaters(
    ownPlacements: readonly Placement[],
    hits: readonly Coord[] = [],
    misses: readonly Coord[] = [],
  ) {
    for (const c of cells) c.className = "wc";
    const key = (c: Coord) => c.row * 10 + c.col;
    const hitSet = new Set(hits.map(key));
    const missSet = new Set(misses.map(key));
    const shipSet = new Set<number>();
    for (const p of ownPlacements) {
      for (const c of shipCells(p)) shipSet.add(key(c));
    }
    for (const k of shipSet) cells[k]?.classList.add("ship");
    for (const k of missSet) cells[k]?.classList.add("miss");
    for (const k of hitSet) cells[k]?.classList.add("hit");
  }

  return {
    update(model) {
      updateWaters(model.ownPlacements, model.ownHits, model.ownMisses);
      statsSec.hidden = false;
      const s = model.stats;
      const pct = Math.round(s.accuracy * 100);
      statsEl.innerHTML =
        `<div><span>Shots</span><b>${s.shots}</b></div>` +
        `<div><span>Hits</span><b>${s.hits} (${pct}%)</b></div>` +
        `<div><span>Your ships afloat</span><b>${s.ownAfloat} of 5</b></div>` +
        `<div><span>Enemy ships afloat</span><b>${s.enemyAfloat} of 5</b></div>`;
    },
    updateWaters,
    pushLog(text) {
      const li = el("li", undefined, text);
      logEl.insertBefore(li, logEl.firstChild);
      while (logEl.children.length > 200) logEl.lastElementChild?.remove();
    },
    dispose() {
      window.removeEventListener("keydown", onEsc);
      stage.parentNode?.insertBefore(canvas, stage);
      stage.remove();
      style.remove();
      fleetBtn.remove();
      logBtn.remove();
      left.remove();
      right.remove();
    },
  };
}
