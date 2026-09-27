import type { AmbienceController, LightningCue } from "../../audio/storm";

export interface MenuDeps {
  readonly ambience: AmbienceController;
  setQuality(q: "auto" | "low" | "high"): void;
  setReducedMotion(on: boolean): void;
  /** Set Sail → transition to the battle board. */
  onSail?(): void;
}

export interface MenuHandles {
  onLightning(e: Pick<LightningCue, "intensity" | "side">): void;
  dispose(): void;
}

const CSS = /* css */ `
.sm-root{position:fixed;inset:0;z-index:10;pointer-events:none;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.sm-root *{box-sizing:border-box}

/* --- captain portraits flanking the menu --- */
.sm-portrait{position:absolute;top:0;bottom:0;width:33vw;max-width:520px;overflow:hidden;
  transition:filter .12s ease-out}
.sm-portrait.left{left:0;mask-image:linear-gradient(to right,black 55%,transparent 98%);
  -webkit-mask-image:linear-gradient(to right,black 55%,transparent 98%)}
.sm-portrait.right{right:0;mask-image:linear-gradient(to left,black 55%,transparent 98%);
  -webkit-mask-image:linear-gradient(to left,black 55%,transparent 98%)}
.sm-portrait img{width:100%;height:100%;object-fit:cover;display:block;
  animation:sm-push 30s ease-in-out infinite alternate}
.sm-portrait.left img{object-position:52% 34%}
.sm-portrait.right img{object-position:50% 32%}
.sm-portrait::after{content:"";position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(4,8,14,.55),transparent 25%,transparent 75%,rgba(4,8,14,.7))}
@keyframes sm-push{from{transform:scale(1.04)}to{transform:scale(1.10)}}

/* --- rain + vignette overlays --- */
.sm-rain{position:absolute;inset:-20% 0;opacity:.5;
  background:
    repeating-linear-gradient(105deg,transparent 0 14px,rgba(160,190,210,.045) 14px 15px),
    repeating-linear-gradient(97deg,transparent 0 23px,rgba(160,190,210,.03) 23px 24px);
  animation:sm-rain 1.1s linear infinite}
@keyframes sm-rain{to{transform:translate(-34px,120px)}}
.sm-vignette{position:absolute;inset:0;
  background:radial-gradient(ellipse at 50% 46%,transparent 52%,rgba(2,5,9,.6) 100%)}

/* --- centre column: constrained to the gap between the portraits --- */
.sm-center{position:absolute;top:0;bottom:0;left:34vw;right:34vw;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:8px}
.sm-title{margin:0}
.sm-title img{width:min(94%,540px);height:auto;display:block;margin:0 auto;
  filter:drop-shadow(0 3px 5px rgba(0,0,0,.7)) drop-shadow(0 0 22px rgba(255,190,90,.28))}
.sm-sub{margin:0 0 38px}
.sm-sub img{width:min(88%,360px);height:auto;display:block;margin:0 auto;
  filter:drop-shadow(0 2px 6px rgba(0,0,0,.75)) drop-shadow(0 0 12px rgba(140,190,230,.2))}
.sm-stack{display:flex;flex-direction:column;gap:14px;pointer-events:auto;width:100%;align-items:center}
.sm-btn{font:700 clamp(15px,1.5vw,19px) Georgia,serif;letter-spacing:.14em;
  color:#ecdfc0;width:min(280px,100%);padding:13px 34px;cursor:pointer;
  background:linear-gradient(180deg,#33271a 0%,#1d150c 55%,#281d10 100%);
  border:2px solid #b08d57;border-radius:4px;
  box-shadow:inset 0 1px 0 rgba(240,220,180,.16),inset 0 -10px 18px rgba(0,0,0,.55),0 5px 16px rgba(0,0,0,.55);
  transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease,filter .08s}
.sm-btn:hover,.sm-btn:focus-visible{
  border-color:#e0c07f;transform:scale(1.025);outline:none;
  box-shadow:inset 0 1px 0 rgba(240,220,180,.2),inset 0 0 22px rgba(224,140,60,.22),
    inset 0 -10px 18px rgba(0,0,0,.5),0 6px 20px rgba(0,0,0,.6)}
.sm-btn:focus-visible{outline:3px solid #ffd97a;outline-offset:2px}
.sm-btn:active{transform:scale(.99)}
.sm-stack.struck .sm-btn{filter:brightness(1.3)}

/* --- panels / toast / hint / audio --- */
.sm-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  min-width:min(340px,88vw);padding:20px 22px;pointer-events:auto;
  background:linear-gradient(180deg,#1c2430,#131a24);
  border:2px solid #b08d57;border-radius:6px;color:#e8dcc0;
  box-shadow:0 20px 60px rgba(0,0,0,.7)}
.sm-panel h2{margin:0 0 14px;font:700 18px Georgia,serif;letter-spacing:.1em;color:#d8b87e}
.sm-panel label{display:flex;justify-content:space-between;align-items:center;gap:14px;
  font-size:13px;padding:8px 0;border-bottom:1px solid rgba(176,141,87,.25)}
.sm-panel select,.sm-panel input{accent-color:#b08d57}
.sm-panel select{background:#0d131c;color:#e8dcc0;border:1px solid #b08d57;
  border-radius:3px;padding:4px 8px;font:inherit}
.sm-panel .sm-close{margin-top:14px;width:100%}
.sm-panel p{font-size:13px;line-height:1.55;margin:6px 0}
.sm-toast{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);
  padding:10px 22px;background:#1c2430;border:1px solid #b08d57;border-radius:5px;
  color:#e8dcc0;font-size:13px;opacity:0;transition:opacity .3s;pointer-events:none}
.sm-toast.show{opacity:1}
.sm-hint{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);
  margin:0;font-size:11px;letter-spacing:.12em;color:#7d93a0;text-transform:uppercase;
  text-shadow:0 1px 3px #000;transition:opacity .8s;white-space:nowrap}
.sm-hint.gone{opacity:0}
.sm-audio{position:absolute;right:16px;bottom:16px;width:42px;height:42px;
  border:1px solid #b08d57;border-radius:50%;cursor:pointer;pointer-events:auto;
  background:rgba(13,19,28,.75);display:flex;align-items:center;justify-content:center}
.sm-audio svg{width:20px;height:20px;fill:#d8b87e}
.sm-audio:focus-visible{outline:3px solid #ffd97a;outline-offset:2px}

/* --- small screens: portraits become a faint full-bleed backdrop --- */
@media (max-width:560px){
  .sm-center{left:0;right:0}
  .sm-portrait{width:58vw;max-width:none;opacity:.28}
  .sm-portrait.left{mask-image:linear-gradient(to right,black 30%,transparent 96%);
    -webkit-mask-image:linear-gradient(to right,black 30%,transparent 96%)}
  .sm-portrait.right{mask-image:linear-gradient(to left,black 30%,transparent 96%);
    -webkit-mask-image:linear-gradient(to left,black 30%,transparent 96%)}
  .sm-btn{min-width:min(270px,78vw)}
}

/* --- reduced motion --- */
.sm-root.sm-reduced .sm-portrait img{animation:none}
.sm-root.sm-reduced .sm-rain{animation:none}
.sm-root.sm-reduced .sm-btn{transition:none}
`;

const SPEAKER_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="#d8b87e" stroke-width="2" stroke-linecap="round"/></svg>`;
const SPEAKER_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 4l6 16M22 4l-6 16" stroke="#d8b87e" stroke-width="2" stroke-linecap="round" fill="none"/></svg>`;

function lsGet(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string): void {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

export function createMenu(parent: HTMLElement, deps: MenuDeps): MenuHandles {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  void import("../../glyphs").then(async ({ loadGlyphs, composeLine }) => {
    await loadGlyphs();
    const title = root.querySelector<HTMLElement>(".sm-title")!;
    // both lines on one canvas so the letter size is identical
    const l1 = composeLine("PIRATE", { capH: 100, spacing: 0.16, spaceW: 0.55 });
    const l2 = composeLine("BATTLESHIP", { capH: 100, spacing: 0.14, spaceW: 0.55 });
    const tc = document.createElement("canvas");
    tc.width = Math.max(l1.width, l2.width);
    tc.height = l1.height + l2.height + 8;
    const tg = tc.getContext("2d")!;
    tg.drawImage(l1, (tc.width - l1.width) / 2, 0);
    tg.drawImage(l2, (tc.width - l2.width) / 2, l1.height + 8);
    title.innerHTML = `<img aria-hidden="true" src="${tc.toDataURL()}" alt="">`;
    const sub = root.querySelector<HTMLElement>(".sm-sub")!;
    const sc = composeLine("THE DROWNED STRAIT", { capH: 44, spacing: 0.22, spaceW: 0.75 });
    sub.innerHTML = `<img aria-hidden="true" src="${sc.toDataURL()}" alt="">`;
  });
  const root = document.createElement("div");
  root.className = "sm-root";
  root.innerHTML = `
    <div class="sm-portrait left"><img src="/assets/captains/captain-ghost.jpg" alt="Captain Ghost"></div>
    <div class="sm-portrait right"><img src="/assets/captains/captain-crow.jpg" alt="Captain Crow"></div>
    <div class="sm-rain" aria-hidden="true"></div>
    <div class="sm-vignette" aria-hidden="true"></div>
    <div class="sm-center">
      <h1 class="sm-title" role="heading" aria-level="1" aria-label="PIRATE BATTLESHIP"></h1>
      <p class="sm-sub" aria-label="THE DROWNED STRAIT"></p>
      <nav class="sm-stack" aria-label="Main menu">
        <button class="sm-btn" data-act="sail">Set Sail</button>
        <button class="sm-btn" data-act="settings">Settings</button>
        <button class="sm-btn" data-act="credits">Credits</button>
      </nav>
    </div>
    <div class="sm-panel" role="dialog" aria-modal="false" hidden></div>
    <div class="sm-toast" role="status"></div>
    <p class="sm-hint">Click or press any key to hear the storm</p>
    <button class="sm-audio" aria-label="Toggle sound" aria-pressed="true">${SPEAKER_ON}</button>
  `;
  parent.appendChild(root);

  const left = root.querySelector<HTMLElement>(".sm-portrait.left")!;
  const right = root.querySelector<HTMLElement>(".sm-portrait.right")!;
  const stack = root.querySelector<HTMLElement>(".sm-stack")!;
  const panel = root.querySelector<HTMLElement>(".sm-panel")!;
  const toast = root.querySelector<HTMLElement>(".sm-toast")!;
  const hint = root.querySelector<HTMLElement>(".sm-hint")!;
  const audioBtn = root.querySelector<HTMLButtonElement>(".sm-audio")!;
  const buttons = [...stack.querySelectorAll<HTMLButtonElement>(".sm-btn")];

  // --- reduced motion: media query × user override ---
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  let rmOverride = lsGet("pb.rm") ?? "auto";
  function effectiveReduced(): boolean {
    return rmOverride === "on" || (rmOverride === "auto" && media.matches);
  }
  function applyReduced() {
    const on = effectiveReduced();
    root.classList.toggle("sm-reduced", on);
    deps.setReducedMotion(on);
  }
  const onMediaChange = () => applyReduced();
  media.addEventListener("change", onMediaChange);
  applyReduced();

  // --- quality restore ---
  const q = lsGet("pb.quality") ?? "auto";
  if (q === "low" || q === "high" || q === "auto") deps.setQuality(q);

  // --- lightning reactions ---
  let flashT = 0;
  function flash(el: HTMLElement, amount: number) {
    const i = effectiveReduced() ? Math.min(amount, 0.3) : amount;
    el.style.filter = `brightness(${1 + i * 0.9}) saturate(${1 + i * 0.35})`;
    window.clearTimeout(flashT);
    flashT = window.setTimeout(() => {
      left.style.filter = "";
      right.style.filter = "";
    }, 130);
  }

  // --- mouse parallax (±8 px) ---
  function onMove(ev: MouseEvent) {
    if (effectiveReduced()) return;
    const nx = ev.clientX / window.innerWidth - 0.5;
    left.style.transform = `translateX(${(-8 + nx * 8).toFixed(1)}px)`;
    right.style.transform = `translateX(${(8 - nx * 8).toFixed(1)}px)`;
  }
  window.addEventListener("mousemove", onMove);

  // --- audio: start on first gesture ---
  let started = false;
  function firstGesture() {
    if (started) return;
    started = true;
    deps.ambience.start();
    hint.classList.add("gone");
  }
  window.addEventListener("pointerdown", firstGesture, { once: false });
  window.addEventListener("keydown", firstGesture, { once: false });

  audioBtn.setAttribute("aria-pressed", String(!deps.ambience.muted));
  if (deps.ambience.muted) audioBtn.innerHTML = SPEAKER_OFF;
  audioBtn.addEventListener("click", () => {
    firstGesture();
    const m = !deps.ambience.muted;
    deps.ambience.setMuted(m);
    audioBtn.setAttribute("aria-pressed", String(!m));
    audioBtn.innerHTML = m ? SPEAKER_OFF : SPEAKER_ON;
  });

  // --- toast ---
  let toastT = 0;
  function showToast(msg: string) {
    toast.textContent = msg;
    toast.classList.add("show");
    window.clearTimeout(toastT);
    toastT = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  // --- panels ---
  function closePanel() {
    panel.hidden = true;
    panel.innerHTML = "";
  }
  function openPanel(title: string, body: string) {
    panel.hidden = false;
    panel.innerHTML = `<h2>${title}</h2>${body}<button class="sm-btn sm-close">Close</button>`;
    panel.querySelector(".sm-close")!.addEventListener("click", closePanel);
  }
  function openSettings() {
    openPanel(
      "Settings",
      `<label>Graphics quality
         <select id="sm-q">
           <option value="auto">Auto</option>
           <option value="low">Low</option>
           <option value="high">High</option>
         </select></label>
       <label>Music volume
         <input id="sm-mv" type="range" min="0" max="100" value="${lsGet("pb.music.vol") ?? 70}"></label>
       <label>Effects volume
         <input id="sm-ev" type="range" min="0" max="100" value="${Math.round(deps.ambience.volume * 100)}"></label>
       <label>Reduced motion
         <select id="sm-rm">
           <option value="auto">Auto</option>
           <option value="on">On</option>
           <option value="off">Off</option>
         </select></label>`,
    );
    const qs = panel.querySelector<HTMLSelectElement>("#sm-q")!;
    qs.value = lsGet("pb.quality") ?? "auto";
    qs.addEventListener("change", () => {
      lsSet("pb.quality", qs.value);
      deps.setQuality(qs.value as "auto" | "low" | "high");
    });
    panel.querySelector<HTMLInputElement>("#sm-mv")!.addEventListener("input", (e) => {
      lsSet("pb.music.vol", (e.target as HTMLInputElement).value);
    });
    panel.querySelector<HTMLInputElement>("#sm-ev")!.addEventListener("input", (e) => {
      deps.ambience.setVolume(Number((e.target as HTMLInputElement).value) / 100);
    });
    const rm = panel.querySelector<HTMLSelectElement>("#sm-rm")!;
    rm.value = rmOverride;
    rm.addEventListener("change", () => {
      rmOverride = rm.value;
      lsSet("pb.rm", rm.value);
      applyReduced();
    });
  }
  function openCredits() {
    openPanel(
      "Credits",
      `<p><b>Pirate Battleship</b> · built with three.js</p>
       <p>Captain art: provided by the project owner</p>
       <p>Storm, rain, thunder and all code: synthesized in the browser.</p>`,
    );
  }

  // --- buttons + keyboard nav ---
  function onAction(act: string) {
    if (act === "sail") {
      if (deps.onSail) deps.onSail();
      else showToast("Mode select comes next");
    }
    else if (act === "settings") openSettings();
    else if (act === "credits") openCredits();
  }
  for (const b of buttons) {
    b.addEventListener("click", () => onAction(b.dataset.act!));
  }
  stack.addEventListener("keydown", (e) => {
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === "ArrowDown") next = (idx + 1) % buttons.length;
    else if (e.key === "ArrowUp") next = (idx - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    if (next >= 0) {
      e.preventDefault();
      buttons[next]!.focus();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  return {
    onLightning(e) {
      const dim = e.intensity * 0.35;
      flash(left, e.side === "left" ? e.intensity : dim);
      flash(right, e.side === "right" ? e.intensity : dim);
      stack.classList.add("struck");
      window.setTimeout(() => stack.classList.remove("struck"), 140);
    },
    dispose() {
      window.removeEventListener("mousemove", onMove);
      media.removeEventListener("change", onMediaChange);
      root.remove();
      style.remove();
    },
  };
}
