import type { CaptainId, Orientation, ShipId } from "../../engine/index";
import { captainProfile, flagSvg, voiceLine, type VoiceEvent } from "../captains";
import { injectTheme, prefersReducedMotion } from "../theme";
import { SHIP_NAMES, type GambitStatus, type ShipReport } from "./controller";

/**
 * Battle HUD: slim top banner, the captain sidebar (portraits, placement
 * dock, Gambit button, fleet manifests) and the game-over panel.
 * A dumb view: it renders what it's given and reports clicks.
 */

const CSS = /* css */ `
body.pb-battle{--pb-sb:clamp(272px,23vw,340px)}
body.pb-battle #scene{position:fixed;top:0;left:var(--pb-sb);width:calc(100% - var(--pb-sb));height:100%}
.pb-hud{position:fixed;top:0;left:var(--pb-sb);right:0;z-index:12;pointer-events:none;
  font-family:Georgia,"Times New Roman",serif}
.pb-banner{margin:10px auto 0;width:fit-content;max-width:min(720px,92%);
  padding:8px 22px;text-align:center;font-size:15px;letter-spacing:.05em;line-height:1.4;
  color:#ecdfc0;background:rgba(12,18,26,.8);border:1px solid #b08d57;
  border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.45)}
.pb-over{position:absolute;top:38vh;left:50%;transform:translate(-50%,-50%);
  pointer-events:auto;text-align:center;padding:26px 40px;
  background:linear-gradient(180deg,#1c2430,#10161f);
  border:2px solid #b08d57;border-radius:6px;box-shadow:0 24px 70px rgba(0,0,0,.7)}
.pb-over h2{margin:0 0 6px;font-size:30px;letter-spacing:.08em;color:#e8c880}
.pb-over p{margin:0 0 18px;font-size:14px;color:#c8b890;letter-spacing:.05em}

/* --- sidebar --- */
.sb{position:fixed;top:0;left:0;bottom:0;width:var(--pb-sb);z-index:13;box-sizing:border-box;
  overflow-y:auto;overflow-x:hidden;padding:12px 12px 16px;display:flex;flex-direction:column;gap:12px;
  font-family:var(--pb-sans);color:var(--pb-ink);
  background:
    linear-gradient(90deg,rgba(0,0,0,0) 94%,rgba(0,0,0,.45)),
    repeating-linear-gradient(0deg,rgba(255,255,255,.012) 0 3px,rgba(0,0,0,.02) 3px 7px),
    linear-gradient(180deg,#1b2330,#10151d 60%,#0c1117);
  border-right:2px solid var(--pb-brass);box-shadow:6px 0 24px rgba(0,0,0,.5)}
.sb *{box-sizing:border-box}
.sb h3{margin:0 0 6px;font:700 11px var(--pb-sans);letter-spacing:.22em;text-transform:uppercase;color:#8fa5b0;
  display:flex;justify-content:space-between;align-items:baseline}
.sb h3 small{font:600 10px var(--pb-sans);letter-spacing:.08em;color:var(--pb-ink-dim);text-transform:none}
.sb-sec{padding:10px;border:1px solid rgba(176,141,87,.45);border-radius:6px;background:rgba(8,12,18,.55)}
.sb-sec[hidden]{display:none}

/* captain card */
.cap{position:relative;border:2px solid var(--pb-brass);border-radius:6px;overflow:hidden;background:#0a0e14;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),0 8px 22px rgba(0,0,0,.5)}
.cap .pic{position:relative;display:block;height:clamp(150px,24vh,220px);overflow:hidden}
.cap .pic img{width:100%;height:100%;object-fit:cover;display:block;transform:scale(1.04);
  animation:cap-push 24s ease-in-out infinite alternate}
@keyframes cap-push{from{transform:scale(1.04)}to{transform:scale(1.12)}}
.cap .pic::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(6,9,14,.1) 40%,rgba(6,9,14,.94) 100%)}
.cap .flag{position:absolute;top:8px;right:8px;width:38px;height:23px;z-index:1;border:1px solid rgba(0,0,0,.6)}
.cap .flag svg{width:100%;height:100%;display:block}
.cap .tag{position:absolute;top:8px;left:8px;z-index:1;padding:2px 7px;border-radius:3px;
  font:700 9px var(--pb-sans);letter-spacing:.2em;text-transform:uppercase;color:#e9dcbc;background:rgba(8,12,18,.75)}
.cap .nm{position:absolute;left:10px;right:10px;bottom:8px;z-index:1}
.cap .nm b{display:block;font:700 19px var(--pb-serif);letter-spacing:.03em;color:#f0d9a4;text-shadow:0 2px 6px #000}
.cap .nm span{font:700 10px var(--pb-sans);letter-spacing:.2em;text-transform:uppercase;color:#a9bcc4}
.cap .say{margin:0;padding:8px 10px;min-height:38px;font:italic 13px/1.4 var(--pb-serif);color:#e9dcbc;
  border-top:1px solid rgba(176,141,87,.4);background:rgba(20,26,36,.9);transition:opacity .3s}
.cap .say:empty::before{content:"…";color:#6f7f88}
.cap.mini{display:grid;grid-template-columns:64px 1fr;align-items:stretch}
.cap.mini .pic{height:auto;min-height:72px}
.cap.mini .pic::after{background:none}
.cap.mini .info{display:flex;flex-direction:column;justify-content:center;padding:6px 10px;gap:2px;min-width:0}
.cap.mini .info b{font:700 15px var(--pb-serif);color:#f0d9a4}
.cap.mini .info span{font:700 9px var(--pb-sans);letter-spacing:.18em;text-transform:uppercase;color:#a9bcc4}
.cap.mini .say{grid-column:1/-1;min-height:30px;font-size:12px;padding:6px 10px}
.cap.hurt{animation:cap-hurt .5s ease-out}
.cap.hurt .pic::before{content:"";position:absolute;inset:0;z-index:1;background:rgba(224,60,30,.35);animation:cap-flash .5s ease-out forwards}
.cap.cheer{box-shadow:0 0 0 1px rgba(240,201,106,.8),0 0 26px rgba(240,170,80,.45)}
@keyframes cap-hurt{0%,100%{transform:none}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-2px)}}
@keyframes cap-flash{to{opacity:0}}

/* placement dock */
.dock-ships{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.dock-ship{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:grid;grid-template-columns:1fr auto;
  align-items:center;gap:4px 8px;padding:7px 9px;border-radius:5px;border:1px solid rgba(176,141,87,.35);
  background:rgba(20,26,36,.8);transition:border-color .15s,background .15s}
.dock-ship:hover{border-color:var(--pb-brass-hi)}
.dock-ship:focus-visible{outline:3px solid #ffd97a;outline-offset:1px}
.dock-ship[aria-pressed="true"]{border-color:#f0c96a;background:linear-gradient(180deg,#3a2c1a,#21180d)}
.dock-ship .n{font:700 14px var(--pb-serif);color:var(--pb-ink)}
.dock-ship .st{font:700 9px var(--pb-sans);letter-spacing:.16em;text-transform:uppercase;color:#8fa5b0}
.dock-ship.placed .st{color:var(--pb-good)}
.dock-ship[aria-pressed="true"] .st{color:#f0c96a}
.dock-ship .hull{grid-column:1/-1}
.dock-row{display:flex;gap:8px;margin-top:10px}
.dock-row .pb-btn{flex:1;padding:9px 8px;font-size:12px;letter-spacing:.08em}
.dock-orient{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding:6px 8px;
  border-radius:5px;background:rgba(20,26,36,.8);border:1px solid rgba(176,141,87,.35);font-size:12px;color:var(--pb-ink-dim)}
.dock-orient b{color:var(--pb-ink);font:700 13px var(--pb-serif);letter-spacing:.06em}
.dock-hint{margin:8px 0 0;font:italic 12px/1.45 var(--pb-serif);color:var(--pb-ink-dim)}
.dock-go{width:100%;margin-top:10px}
.dock-ctl[hidden]{display:none}
.dock-ctl .dock-orient{margin-top:0}

/* hull strip: ship art with one box per square */
.hull{position:relative;height:22px;display:flex;border-radius:3px}
.hull .art{position:absolute;inset:-3px -2px;background-size:100% 100%;background-repeat:no-repeat;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.7))}
.hull .seg{position:relative;flex:0 0 22px;height:22px;border:1px dashed rgba(233,220,188,.28);margin-right:-1px}
.hull .seg.hit{background:rgba(190,36,24,.55);border:1px solid #ff6a4a}
.hull .seg.hit::after{content:"";position:absolute;inset:3px;
  background:linear-gradient(45deg,transparent 42%,#fff2e0 42% 58%,transparent 58%),
             linear-gradient(-45deg,transparent 42%,#fff2e0 42% 58%,transparent 58%)}
.hull.sunk .art{filter:grayscale(1) brightness(.45)}
.hull.sunk .seg{background:rgba(60,14,10,.6);border-color:rgba(255,106,74,.5)}

/* fleet manifest */
.fleet{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px}
.fleet li{display:grid;grid-template-columns:1fr auto;gap:3px 8px;align-items:center}
.fleet .n{font:700 13px var(--pb-serif);color:var(--pb-ink)}
.fleet .st{font:700 9px var(--pb-sans);letter-spacing:.14em;text-transform:uppercase;color:var(--pb-good)}
.fleet .hull{grid-column:1/-1}
.fleet li.dmg .st{color:#f0b060}
.fleet li.sunk .n{text-decoration:line-through;text-decoration-color:#ff6a4a;color:#9a8f7a}
.fleet li.sunk .st{color:#ff6a4a}
.fleet-sum{font:600 11px var(--pb-sans);color:var(--pb-ink-dim)}

/* gambit */
.gb-h{display:flex;justify-content:space-between;align-items:center;gap:8px}
.gb-h b{font:700 17px var(--pb-serif);color:#f0c96a;letter-spacing:.04em}
.gb-state{font:700 9px var(--pb-sans);letter-spacing:.18em;text-transform:uppercase;padding:3px 7px;border-radius:3px}
.gb-state.ready{color:#0d1a10;background:var(--pb-good)}
.gb-state.unavailable{color:#1b140a;background:#c8b890}
.gb-state.spent{color:#c8b890;background:rgba(200,184,144,.15);border:1px solid rgba(200,184,144,.35)}
.gb-state.aiming{color:#1b140a;background:#ffd97a}
.gb-t{margin:6px 0 8px;font-size:12.5px;line-height:1.45;color:#dfe7ea}
.gb-btn{width:100%}
.gb-why{margin:6px 0 0;font:italic 12px/1.4 var(--pb-serif);color:var(--pb-ink-dim);min-height:1em}
.gb-why.aim{color:#ffd97a;font-style:normal;font-family:var(--pb-sans);font-weight:600}
.gb-sec{border-color:rgba(31,111,120,.8);background:rgba(31,111,120,.14)}

.sb.reduced *{animation:none!important;transition:none!important}

@media (max-width:760px){
  body.pb-battle{--pb-sb:0px;--pb-sbh:min(46vh,420px)}
  body.pb-battle #scene{left:0;width:100%;height:calc(100% - var(--pb-sbh))}
  .pb-hud{left:0}
  .sb{top:auto;width:100%;height:var(--pb-sbh);border-right:0;border-top:2px solid var(--pb-brass)}
  .cap .pic{height:120px}
}
`;

export interface HudDeps {
  captains: readonly [CaptainId, CaptainId];
  gambitMode: boolean;
  onSelectShip(id: ShipId): void;
  onRotate(): void;
  onRandomize(): void;
  onClear(): void;
  onStart(): void;
  onGambit(): void;
}

export interface DockShip {
  readonly id: ShipId;
  readonly length: number;
  readonly placed: boolean;
  readonly selected: boolean;
}

export interface HudHandles {
  banner(text: string): void;
  placement(m: { ships: readonly DockShip[]; orientation: Orientation; complete: boolean }): void;
  battle(): void;
  fleet(r: { own: readonly ShipReport[]; enemy: readonly ShipReport[] }): void;
  /** aim = targeting hint while a Gambit is being aimed. */
  gambit(s: GambitStatus | null, aim: string | null): void;
  say(side: "own" | "enemy", ev: VoiceEvent): void;
  react(side: "own" | "enemy", kind: "hurt" | "cheer"): void;
  gameOver(victory: boolean): void;
  dispose(): void;
}

const shipArt = (color: string, id: ShipId) => `/assets/ships/${color}/${id}.png`;

function hullHtml(color: string, id: ShipId, segs: readonly boolean[], sunk = false): string {
  return `<span class="hull${sunk ? " sunk" : ""}" style="width:${segs.length * 21 + 1}px" aria-hidden="true">
    <span class="art" style="background-image:url('${shipArt(color, id)}')"></span>
    ${segs.map((h) => `<span class="seg${h ? " hit" : ""}"></span>`).join("")}
  </span>`;
}

function capCard(id: CaptainId, tag: string, mini: boolean): string {
  const p = captainProfile(id);
  const pic = `<span class="pic"><img src="${p.portrait}" alt="" style="object-position:${p.focus}" decoding="async">
    ${mini ? "" : `<span class="flag" title="Flag: ${p.flag.emblem}">${flagSvg(id)}</span><span class="tag">${tag}</span>
    <span class="nm"><b>${p.name}</b><span>${p.archetype}</span></span>`}</span>`;
  return mini
    ? `<div class="cap mini">${pic}<span class="info"><span>${tag}</span><b>${p.name}</b><span>${p.archetype}</span></span><p class="say" aria-live="polite"></p></div>`
    : `<div class="cap">${pic}<p class="say" aria-live="polite"></p></div>`;
}

export function createHud(parent: HTMLElement, deps: HudDeps, colors: readonly [string, string]): HudHandles {
  injectTheme();
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.classList.add("pb-battle");

  const [ownCap, enemyCap] = deps.captains;
  const own = captainProfile(ownCap);

  const root = document.createElement("div");
  root.className = "pb-hud";
  root.innerHTML = `<div class="pb-banner" role="status"></div>`;
  parent.appendChild(root);
  const bannerEl = root.querySelector<HTMLElement>(".pb-banner")!;

  const sb = document.createElement("aside");
  sb.className = "sb";
  sb.classList.toggle("reduced", prefersReducedMotion());
  sb.setAttribute("aria-label", "Captain's sidebar");
  sb.innerHTML = `
    <div class="sb-own">${capCard(ownCap, "Your captain", false)}</div>
    <section class="sb-sec dock-ctl" aria-label="Fleet controls">
      <div class="dock-orient"><span>Heading</span><b class="dock-o"></b></div>
      <div class="dock-row">
        <button class="pb-btn small" data-act="rotate">Rotate <span class="pb-kbd">R</span></button>
        <button class="pb-btn small" data-act="random">Randomize</button>
        <button class="pb-btn small" data-act="clear">Clear</button>
      </div>
      <p class="dock-hint">Pick a ship, then click a square in <b>your waters</b>. Ships lie across or down the squares only — never diagonal, never off the chart. Click a placed ship to move it.</p>
      <button class="pb-btn dock-go" data-act="start" disabled>Set Sail!</button>
    </section>
    <section class="sb-sec sb-dock" aria-label="Deploy your fleet">
      <h3>Deploy your fleet <small class="dock-count"></small></h3>
      <ul class="dock-ships"></ul>
    </section>
    <section class="sb-sec gb-sec" hidden aria-label="Captain's Gambit">
      <h3>Captain's Gambit <small>once per battle</small></h3>
      <div class="gb-h"><b>${own.gambit.name}</b><span class="gb-state"></span></div>
      <p class="gb-t">${own.gambit.text}</p>
      <button class="pb-btn small gb-btn" data-act="gambit">Invoke ${own.gambit.name} <span class="pb-kbd">G</span></button>
      <p class="gb-why" aria-live="polite"></p>
    </section>
    <section class="sb-sec fl-own" hidden aria-label="Your fleet">
      <h3>Your fleet <small class="fleet-sum"></small></h3>
      <ul class="fleet"></ul>
    </section>
    <div class="sb-enemy" hidden>${capCard(enemyCap, "Enemy captain", true)}</div>
    <section class="sb-sec fl-enemy" hidden aria-label="Enemy fleet">
      <h3>Enemy fleet <small class="fleet-sum"></small></h3>
      <ul class="fleet"></ul>
    </section>`;
  parent.appendChild(sb);

  const q = <T extends HTMLElement>(s: string) => sb.querySelector<T>(s)!;
  const dock = q<HTMLElement>(".sb-dock");
  const gbSec = q<HTMLElement>(".gb-sec");
  const flOwn = q<HTMLElement>(".fl-own");
  const flEnemy = q<HTMLElement>(".fl-enemy");
  const enemyCard = q<HTMLElement>(".sb-enemy");
  const cards = { own: q<HTMLElement>(".sb-own .cap"), enemy: q<HTMLElement>(".sb-enemy .cap") };
  const voiceN: Record<string, number> = {};

  sb.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const ship = t.closest<HTMLElement>("[data-ship]")?.dataset.ship as ShipId | undefined;
    if (ship) return deps.onSelectShip(ship);
    const act = t.closest<HTMLButtonElement>("[data-act]");
    if (!act || act.disabled) return;
    ({
      rotate: deps.onRotate,
      random: deps.onRandomize,
      clear: deps.onClear,
      start: deps.onStart,
      gambit: deps.onGambit,
    } as Record<string, () => void>)[act.dataset.act!]?.();
  });

  function fleetList(sec: HTMLElement, reps: readonly ShipReport[], color: string, enemy: boolean) {
    const afloat = reps.filter((r) => !r.sunk).length;
    sec.querySelector(".fleet-sum")!.textContent = `${afloat} of ${reps.length} afloat`;
    sec.querySelector(".fleet")!.innerHTML = reps
      .map((r) => {
        const st = r.sunk
          ? "Sunk"
          : r.hits === 0
            ? "Afloat"
            : `${r.hits} of ${r.length} hit`;
        const where = enemy && !r.sunk && r.hits > 0 ? " (squares unknown)" : "";
        const label = `${SHIP_NAMES[r.id]}, ${r.length} squares: ${st}${where}`;
        return `<li class="${r.sunk ? "sunk" : r.hits ? "dmg" : ""}" aria-label="${label}">
          <span class="n">${SHIP_NAMES[r.id]}</span><span class="st">${st}</span>
          ${hullHtml(color, r.id, r.segments, r.sunk)}</li>`;
      })
      .join("");
  }

  const timers = new Map<HTMLElement, number>();
  return {
    banner(t) {
      bannerEl.textContent = t;
    },
    placement(m) {
      dock.hidden = false;
      q<HTMLElement>(".dock-ctl").hidden = false;
      const placed = m.ships.filter((s) => s.placed).length;
      q<HTMLElement>(".dock-count").textContent = `${placed} / ${m.ships.length} at sea`;
      q<HTMLElement>(".dock-ships").innerHTML = m.ships
        .map(
          (s) => `<li><button class="dock-ship${s.placed ? " placed" : ""}" data-ship="${s.id}"
            aria-pressed="${s.selected}" aria-label="${SHIP_NAMES[s.id]}, ${s.length} squares${s.placed ? ", placed" : ""}">
            <span class="n">${SHIP_NAMES[s.id]}</span>
            <span class="st">${s.selected ? "Placing…" : s.placed ? "At sea ✓" : `${s.length} squares`}</span>
            ${hullHtml(colors[0], s.id, Array.from({ length: s.length }, () => false))}
          </button></li>`,
        )
        .join("");
      q<HTMLElement>(".dock-o").textContent = m.orientation === "H" ? "Across (horizontal) →" : "Down (vertical) ↓";
      q<HTMLButtonElement>(".dock-go").disabled = !m.complete;
    },
    battle() {
      dock.hidden = true;
      q<HTMLElement>(".dock-ctl").hidden = true;
      gbSec.hidden = !deps.gambitMode;
      flOwn.hidden = false;
      flEnemy.hidden = false;
      enemyCard.hidden = false;
    },
    fleet(r) {
      fleetList(flOwn, r.own, colors[0], false);
      fleetList(flEnemy, r.enemy, colors[1], true);
    },
    gambit(s, aim) {
      if (!s) return;
      const st = q<HTMLElement>(".gb-state");
      const btn = q<HTMLButtonElement>(".gb-btn");
      const why = q<HTMLElement>(".gb-why");
      const shown = aim ? "aiming" : s.state;
      st.className = `gb-state ${shown}`;
      st.textContent = aim ? "Aiming" : s.state === "ready" ? "Ready" : s.state === "spent" ? "Spent" : "Unavailable";
      btn.disabled = !aim && s.state !== "ready";
      btn.innerHTML = aim
        ? `Cancel <span class="pb-kbd">Esc</span>`
        : s.state === "spent"
          ? "Spent"
          : `Invoke ${s.name} <span class="pb-kbd">G</span>`;
      why.classList.toggle("aim", !!aim);
      why.textContent = aim ?? (s.state === "ready" ? "" : s.reason ?? "");
    },
    say(side, ev) {
      const id = side === "own" ? ownCap : enemyCap;
      const k = `${side}:${ev}`;
      const n = (voiceN[k] = (voiceN[k] ?? -1) + 1);
      cards[side].querySelector(".say")!.textContent = `“${voiceLine(id, ev, n)}”`;
    },
    react(side, kind) {
      const el = cards[side];
      el.classList.remove("hurt", "cheer");
      void el.offsetWidth; // restart the animation
      el.classList.add(kind);
      window.clearTimeout(timers.get(el));
      timers.set(el, window.setTimeout(() => el.classList.remove(kind), 900));
    },
    gameOver(victory) {
      const el = document.createElement("div");
      el.className = "pb-over";
      el.innerHTML = victory
        ? `<h2>VICTORY</h2><p>The Strait is yours.</p><button class="pb-btn">Back to menu</button>`
        : `<h2>DEFEAT</h2><p>Down to Davy Jones' locker…</p><button class="pb-btn">Back to menu</button>`;
      el.querySelector("button")!.addEventListener("click", () => {
        window.location.href = "/";
      });
      root.appendChild(el);
    },
    dispose() {
      root.remove();
      sb.remove();
      style.remove();
      document.body.classList.remove("pb-battle");
    },
  };
}
