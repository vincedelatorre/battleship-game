import type { CaptainId } from "../../engine/captains";
import type { Difficulty } from "../../ai/shot";
import { CAPTAIN_PROFILES, captainProfile, flagSvg, voiceLine } from "../captains";
import { loadConfig, saveConfig, type MatchConfig, type Mode } from "../config";
import { injectTheme, prefersReducedMotion } from "../theme";

/**
 * Setup screens over the storm menu (§1C.1 steps 3–4):
 * Mode & Difficulty, then Choose Your Captain (both modes; the Gambit
 * text only shows in Gambit mode). Choices persist in localStorage.
 */
export interface SetupDeps {
  onBack(): void;
  onDone(config: MatchConfig): void;
}

export interface SetupHandles {
  dispose(): void;
}

const CSS = /* css */ `
.su-root{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;
  font-family:var(--pb-sans);color:var(--pb-ink);
  background:radial-gradient(ellipse at 50% 45%,rgba(4,10,18,.35),rgba(2,5,10,.82) 80%);
  animation:su-in .35s ease-out}
@keyframes su-in{from{opacity:0}to{opacity:1}}
.su-screen{width:min(1120px,94vw);max-height:100vh;overflow:auto;padding:24px 8px;
  display:flex;flex-direction:column;align-items:center;gap:18px}
.su-screen[hidden]{display:none}
.su-title{margin:0;min-height:52px}
.su-title img{height:clamp(34px,5.4vw,56px);width:auto;display:block;
  filter:drop-shadow(0 3px 5px rgba(0,0,0,.7)) drop-shadow(0 0 18px rgba(255,190,90,.22))}
.su-lede{margin:-8px 0 4px;font:italic 15px var(--pb-serif);color:var(--pb-ink-dim);text-align:center}

/* --- mode cards --- */
.su-modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;width:min(780px,100%)}
.su-mode{all:unset;box-sizing:border-box;cursor:pointer;position:relative;padding:22px 24px 20px;
  border:2px solid rgba(176,141,87,.55);border-radius:8px;
  background:linear-gradient(180deg,rgba(28,36,48,.9),rgba(12,17,25,.92));
  box-shadow:0 10px 30px rgba(0,0,0,.5);transition:transform .18s ease,border-color .18s,box-shadow .18s}
.su-mode:hover{border-color:var(--pb-brass-hi)}
.su-mode:focus-visible{outline:3px solid #ffd97a;outline-offset:3px}
.su-mode[aria-checked="true"]{border-color:var(--pb-brass-hi);transform:translateY(-3px);
  box-shadow:0 0 0 1px rgba(224,192,127,.6),0 0 34px rgba(224,160,80,.22),0 16px 40px rgba(0,0,0,.6)}
.su-mode .kick{display:block;font:700 10px var(--pb-sans);letter-spacing:.22em;text-transform:uppercase;color:#8fa5b0}
.su-mode .h{display:block;margin:6px 0 4px;font:700 28px var(--pb-serif);letter-spacing:.06em;color:#e8c880}
.su-mode .p{display:block;margin:0 0 12px;font:italic 15px var(--pb-serif);color:var(--pb-ink-dim)}
.su-mode .li{display:block;font-size:13px;line-height:1.7;color:#d6cbb0;padding-left:16px;position:relative}
.su-mode .li::before{content:"";position:absolute;left:3px;top:.72em;width:5px;height:5px;border-radius:50%;background:var(--pb-brass)}
.su-mode .tick{position:absolute;top:16px;right:16px;width:22px;height:22px;border-radius:50%;
  border:2px solid var(--pb-brass);display:grid;place-items:center}
.su-mode[aria-checked="true"] .tick::after{content:"";width:10px;height:10px;border-radius:50%;background:#f0c96a}

/* --- difficulty --- */
.su-diff{display:flex;gap:10px;padding:6px;border:1px solid rgba(176,141,87,.45);border-radius:8px;
  background:rgba(10,14,20,.7)}
.su-diff button{all:unset;box-sizing:border-box;cursor:pointer;min-width:190px;padding:10px 16px;border-radius:5px;
  text-align:center;border:1px solid transparent;transition:background .15s,border-color .15s}
.su-diff button b{display:block;font:700 17px var(--pb-serif);letter-spacing:.08em;color:var(--pb-ink)}
.su-diff button span{display:block;font-size:12px;color:#9fb0b8;margin-top:2px}
.su-diff button[aria-checked="true"]{background:linear-gradient(180deg,#3a2c1a,#21180d);border-color:var(--pb-brass)}
.su-diff button[aria-checked="true"] b{color:#f0cf88}
.su-diff button:focus-visible{outline:3px solid #ffd97a;outline-offset:2px}
.su-row{display:flex;gap:14px;justify-content:center;margin-top:6px}

/* --- captain cards + hero shot --- */
.su-caps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;width:100%;padding:14px 4px 4px}
.su-cap{all:unset;box-sizing:border-box;cursor:pointer;position:relative;display:flex;flex-direction:column;
  border:2px solid rgba(176,141,87,.5);border-radius:8px;overflow:hidden;
  background:linear-gradient(180deg,#18202b,#0e131a);box-shadow:0 10px 26px rgba(0,0,0,.55);
  transition:transform .6s cubic-bezier(.2,.8,.2,1),filter .45s ease,border-color .3s,box-shadow .6s}
.su-cap:focus-visible{outline:3px solid #ffd97a;outline-offset:3px}
.su-cap .pic{display:block;position:relative;aspect-ratio:4/4.3;overflow:hidden;background:#0a0e14}
.su-cap .pic img{width:100%;height:100%;object-fit:cover;display:block;transform:scale(1.02);
  transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.su-cap .pic::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,transparent 45%,rgba(8,11,16,.92) 100%)}
.su-cap .nm{position:absolute;left:12px;right:12px;bottom:10px;z-index:1}
.su-cap .nm b{display:block;font:700 19px var(--pb-serif);letter-spacing:.04em;color:#f0d9a4;
  text-shadow:0 2px 6px #000}
.su-cap .nm span{font:700 10px var(--pb-sans);letter-spacing:.2em;text-transform:uppercase;color:#a9bcc4}
.su-cap .flag{position:absolute;top:10px;right:10px;width:40px;height:24px;z-index:1;
  border:1px solid rgba(0,0,0,.6);box-shadow:0 2px 6px rgba(0,0,0,.6)}
.su-cap .flag svg{width:100%;height:100%;display:block}
.su-cap .body{padding:10px 12px 14px;display:flex;flex-direction:column;gap:8px;flex:1}
.su-cap .bio{display:block;font:italic 13px/1.45 var(--pb-serif);color:#cdbf9e}
.su-cap .gmb{display:block;font-size:12.5px;line-height:1.45;color:#dfe7ea;padding:8px 9px;border-radius:5px;
  background:rgba(31,111,120,.18);border:1px solid rgba(31,111,120,.55)}
.su-cap .gmb b{color:#f0c96a;letter-spacing:.04em}
.su-cap .cos{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7f929b}
.su-cap [hidden]{display:none}
.su-cap .say{position:absolute;left:10px;right:10px;top:10px;z-index:2;padding:8px 10px;border-radius:6px;
  font:italic 13px/1.35 var(--pb-serif);color:#1b140a;background:#e9dcbc;border:1px solid #b08d57;
  box-shadow:0 4px 14px rgba(0,0,0,.5);opacity:0;transform:translateY(-6px);transition:opacity .3s .25s,transform .3s .25s}
.su-caps.has-sel .su-cap:not(.sel){filter:blur(1.6px) brightness(.5) saturate(.7);transform:scale(.965)}
.su-cap.sel{border-color:var(--pb-brass-hi);transform:translateY(-12px) scale(1.06);z-index:2;
  box-shadow:0 0 0 1px rgba(240,201,106,.7),0 0 40px rgba(240,170,80,.28),0 24px 50px rgba(0,0,0,.7)}
.su-cap.sel .pic img{transform:scale(1.14) translate(var(--px,0px),var(--py,0px))}
.su-cap.sel .say{opacity:1;transform:none}
.su-root.reduced *{transition:none!important;animation:none!important}
.su-root.reduced .su-cap.sel{transform:none}
.su-root.reduced .su-caps.has-sel .su-cap:not(.sel){filter:brightness(.55);transform:none}

@media (max-width:860px){
  .su-caps{grid-template-columns:repeat(2,minmax(0,1fr))}
  .su-cap .pic{aspect-ratio:16/10}
}
@media (max-width:560px){
  .su-modes{grid-template-columns:1fr}
  .su-diff{flex-direction:column;width:100%}
  .su-diff button{min-width:0}
  .su-caps{grid-template-columns:1fr 1fr;gap:10px}
  .su-cap .bio{display:none}
  .su-cap .say{top:5px;left:5px;right:5px;padding:4px 7px;font-size:11px}
  .su-cap .nm b{font-size:16px}
}
`;

export function createSetup(parent: HTMLElement, deps: SetupDeps): SetupHandles {
  injectTheme();
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  let cfg = loadConfig();

  const root = document.createElement("div");
  root.className = "su-root";
  root.classList.toggle("reduced", prefersReducedMotion());
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Voyage setup");
  root.innerHTML = `
    <section class="su-screen su-mode-screen" aria-labelledby="su-t1">
      <h2 class="su-title" id="su-t1" aria-label="Choose your waters"></h2>
      <p class="su-lede">Two ways to fight for the Drowned Strait.</p>
      <div class="su-modes" role="radiogroup" aria-label="Game mode">
        <button class="su-mode" role="radio" data-mode="standard">
          <span class="tick" aria-hidden="true"></span>
          <span class="kick">Mode</span>
          <span class="h">Standard</span>
          <span class="p">Classic rules. Pure seamanship.</span>
          <span class="li">10×10 chart, five ships a side</span><span class="li">One shot a turn; hits name the ship</span><span class="li">Your captain is for show</span>
        </button>
        <button class="su-mode" role="radio" data-mode="gambit">
          <span class="tick" aria-hidden="true"></span>
          <span class="kick">Mode</span>
          <span class="h">Gambit</span>
          <span class="p">Each captain carries one secret power.</span>
          <span class="li">Same chart, same fleet</span><span class="li">One Gambit per captain, once per game</span><span class="li">The enemy captain has one too</span>
        </button>
      </div>
      <div class="su-diff" role="radiogroup" aria-label="Difficulty">
        <button role="radio" data-diff="easy"><b>Deckhand</b><span>Fires wild. A gentle first voyage.</span></button>
        <button role="radio" data-diff="medium"><b>Buccaneer</b><span>Hunts in patterns and finishes ships.</span></button>
      </div>
      <div class="su-row">
        <button class="pb-btn small" data-act="back">Back</button>
        <button class="pb-btn" data-act="next">Choose Captain</button>
      </div>
    </section>
    <section class="su-screen su-cap-screen" aria-labelledby="su-t2" hidden>
      <h2 class="su-title" id="su-t2" aria-label="Choose your captain"></h2>
      <p class="su-lede su-cap-lede"></p>
      <div class="su-caps" role="radiogroup" aria-label="Captain">
        ${CAPTAIN_PROFILES.map(
          (p) => `
          <button class="su-cap" role="radio" data-cap="${p.id}" aria-label="${p.name}, ${p.archetype}">
            <span class="pic">
              <img src="${p.portrait}" alt="" style="object-position:${p.focus}" loading="lazy" decoding="async">
              <span class="flag" title="Flag: ${p.flag.emblem}">${flagSvg(p.id)}</span>
              <span class="say" aria-hidden="true"></span>
              <span class="nm"><b>${p.name}</b><span>${p.archetype}</span></span>
            </span>
            <span class="body">
              <span class="bio">${p.bio}</span>
              <span class="gmb"><b>${p.gambit.name}</b> — ${p.gambit.text}</span>
              <span class="cos">Cosmetic in Standard mode</span>
            </span>
          </button>`,
        ).join("")}
      </div>
      <p class="pb-sr" aria-live="polite" id="su-say"></p>
      <div class="su-row">
        <button class="pb-btn small" data-act="back2">Back</button>
        <button class="pb-btn" data-act="go">To Placement</button>
      </div>
    </section>`;
  parent.appendChild(root);

  const modeScreen = root.querySelector<HTMLElement>(".su-mode-screen")!;
  const capScreen = root.querySelector<HTMLElement>(".su-cap-screen")!;
  const modeBtns = [...root.querySelectorAll<HTMLButtonElement>(".su-mode")];
  const diffBtns = [...root.querySelectorAll<HTMLButtonElement>(".su-diff button")];
  const capBtns = [...root.querySelectorAll<HTMLButtonElement>(".su-cap")];
  const capsGrid = root.querySelector<HTMLElement>(".su-caps")!;
  const sayLive = root.querySelector<HTMLElement>("#su-say")!;

  // glyph titles (same lettering as the menu); the aria-label carries the text
  void import("../../glyphs").then(async ({ loadGlyphs, composeLine }) => {
    await loadGlyphs();
    for (const [sel, text] of [
      ["#su-t1", "CHOOSE YOUR WATERS"],
      ["#su-t2", "CHOOSE YOUR CAPTAIN"],
    ] as const) {
      const c = composeLine(text, { capH: 70, spacing: 0.14, spaceW: 0.55 });
      root.querySelector(sel)!.innerHTML = `<img aria-hidden="true" alt="" src="${c.toDataURL()}">`;
    }
  });

  function radio(btns: HTMLButtonElement[], pick: (b: HTMLButtonElement) => boolean) {
    for (const b of btns) {
      const on = pick(b);
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  function render() {
    radio(modeBtns, (b) => b.dataset.mode === cfg.mode);
    radio(diffBtns, (b) => b.dataset.diff === cfg.difficulty);
    radio(capBtns, (b) => b.dataset.cap === cfg.captain);
    const gambit = cfg.mode === "gambit";
    for (const b of capBtns) {
      b.querySelector<HTMLElement>(".gmb")!.hidden = !gambit;
      b.querySelector<HTMLElement>(".cos")!.hidden = gambit;
      b.classList.toggle("sel", b.dataset.cap === cfg.captain);
    }
    capsGrid.classList.add("has-sel");
    root.querySelector<HTMLElement>(".su-cap-lede")!.textContent = gambit
      ? "Pick the captain whose Gambit suits your nerve."
      : "Pick your colours. In Standard mode the captain is for show.";
  }

  function selectCaptain(id: CaptainId, speak: boolean) {
    cfg = { ...cfg, captain: id };
    render();
    const b = capBtns.find((x) => x.dataset.cap === id)!;
    const line = voiceLine(id, "select");
    b.querySelector<HTMLElement>(".say")!.textContent = `“${line}”`;
    if (speak) sayLive.textContent = `${captainProfile(id).name}: ${line}`;
  }

  // arrow-key roving focus inside each radiogroup
  function roving(btns: HTMLButtonElement[], onPick: (b: HTMLButtonElement) => void) {
    for (const b of btns) {
      b.addEventListener("click", () => onPick(b));
      b.addEventListener("keydown", (e) => {
        const i = btns.indexOf(b);
        let n = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % btns.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + btns.length) % btns.length;
        if (n >= 0) {
          e.preventDefault();
          onPick(btns[n]!);
          btns[n]!.focus();
        }
      });
    }
  }
  roving(modeBtns, (b) => {
    cfg = { ...cfg, mode: b.dataset.mode as Mode };
    render();
  });
  roving(diffBtns, (b) => {
    cfg = { ...cfg, difficulty: b.dataset.diff as Difficulty };
    render();
  });
  roving(capBtns, (b) => selectCaptain(b.dataset.cap as CaptainId, true));

  // subtle portrait parallax on the selected card
  capsGrid.addEventListener("pointermove", (e) => {
    const sel = capBtns.find((b) => b.classList.contains("sel"));
    if (!sel || root.classList.contains("reduced")) return;
    const r = sel.getBoundingClientRect();
    const nx = (e.clientX - (r.left + r.width / 2)) / r.width;
    const ny = (e.clientY - (r.top + r.height / 2)) / r.height;
    sel.style.setProperty("--px", `${(-nx * 6).toFixed(1)}px`);
    sel.style.setProperty("--py", `${(-ny * 4).toFixed(1)}px`);
  });

  function showCaptains() {
    saveConfig(cfg);
    modeScreen.hidden = true;
    capScreen.hidden = false;
    selectCaptain(cfg.captain, false);
    capBtns.find((b) => b.dataset.cap === cfg.captain)?.focus();
  }
  function showModes() {
    capScreen.hidden = true;
    modeScreen.hidden = false;
    modeBtns.find((b) => b.dataset.mode === cfg.mode)?.focus();
  }

  root.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "back") deps.onBack();
    else if (act === "next") showCaptains();
    else if (act === "back2") showModes();
    else if (act === "go") {
      saveConfig(cfg);
      deps.onDone(cfg);
    }
  });
  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (!capScreen.hidden) showModes();
    else deps.onBack();
  }
  window.addEventListener("keydown", onKey);

  render();
  modeBtns.find((b) => b.dataset.mode === cfg.mode)?.focus();

  return {
    dispose() {
      window.removeEventListener("keydown", onKey);
      root.remove();
      style.remove();
    },
  };
}
