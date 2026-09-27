/** §1C.8 palette + shared chrome, injected once as CSS custom properties. */
const CSS = /* css */ `
:root{
  --pb-parchment:#d8c39a; --pb-brass:#b08d57; --pb-brass-hi:#e0c07f; --pb-timber:#4a3322;
  --pb-deep:#0b3440; --pb-surface:#1f6f78; --pb-accent:#e0582a; --pb-slate:#1c2430;
  --pb-ink:#ecdfc0; --pb-ink-dim:#c8b890; --pb-good:#4fbf7a; --pb-bad:#e0582a;
  --pb-serif:Georgia,"Times New Roman",serif;
  --pb-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
}
.pb-btn{font:700 clamp(14px,1.3vw,17px) var(--pb-serif);letter-spacing:.12em;color:var(--pb-ink);
  padding:12px 30px;cursor:pointer;border:2px solid var(--pb-brass);border-radius:4px;
  background:linear-gradient(180deg,#33271a 0%,#1d150c 55%,#281d10 100%);
  box-shadow:inset 0 1px 0 rgba(240,220,180,.16),inset 0 -10px 18px rgba(0,0,0,.55),0 5px 16px rgba(0,0,0,.55);
  transition:transform .12s ease,border-color .12s ease,filter .12s ease}
.pb-btn:hover:not(:disabled){border-color:var(--pb-brass-hi);transform:translateY(-1px)}
.pb-btn:focus-visible{outline:3px solid #ffd97a;outline-offset:2px}
.pb-btn:disabled{opacity:.45;cursor:not-allowed}
.pb-btn.small{padding:9px 18px;font-size:13px}
.pb-panel{background:linear-gradient(180deg,rgba(28,36,48,.94),rgba(16,22,31,.94));
  border:2px solid var(--pb-brass);border-radius:6px;color:var(--pb-ink);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),0 12px 40px rgba(0,0,0,.55)}
.pb-kbd{display:inline-block;padding:0 5px;margin-left:4px;border:1px solid rgba(176,141,87,.6);
  border-radius:3px;font:600 11px var(--pb-sans);letter-spacing:0;color:var(--pb-ink-dim)}
.pb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

let injected = false;
export function injectTheme(): void {
  if (injected) return;
  injected = true;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Reduced motion: media query × the menu's persisted override (pb.rm). */
export function prefersReducedMotion(): boolean {
  let o: string | null = null;
  try {
    o = window.localStorage.getItem("pb.rm");
  } catch {
    /* ignore */
  }
  if (o === "on") return true;
  if (o === "off") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
