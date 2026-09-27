/** Slim top banner + game-over panel for the battle board. */

const CSS = /* css */ `
.pb-hud{position:fixed;top:0;left:0;right:0;z-index:12;pointer-events:none;
  font-family:Georgia,"Times New Roman",serif}
.pb-banner{margin:10px auto 0;width:fit-content;max-width:min(680px,92vw);
  padding:8px 22px;text-align:center;font-size:15px;letter-spacing:.06em;
  color:#ecdfc0;background:rgba(12,18,26,.78);border:1px solid #b08d57;
  border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.45)}
.pb-over{position:absolute;top:38%;left:50%;transform:translate(-50%,-50%);
  pointer-events:auto;text-align:center;padding:26px 40px;
  background:linear-gradient(180deg,#1c2430,#10161f);
  border:2px solid #b08d57;border-radius:6px;box-shadow:0 24px 70px rgba(0,0,0,.7)}
.pb-over h2{margin:0 0 6px;font-size:30px;letter-spacing:.08em;color:#e8c880}
.pb-over p{margin:0 0 18px;font-size:14px;color:#c8b890;letter-spacing:.05em}
.pb-over button{font:700 16px Georgia,serif;letter-spacing:.12em;cursor:pointer;
  color:#ecdfc0;padding:12px 30px;background:linear-gradient(180deg,#33271a,#1d150c);
  border:2px solid #b08d57;border-radius:4px}
.pb-over button:focus-visible{outline:3px solid #ffd97a;outline-offset:2px}
`;

export interface HudHandles {
  banner(text: string): void;
  gameOver(victory: boolean): void;
  dispose(): void;
}

export function createHud(parent: HTMLElement): HudHandles {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement("div");
  root.className = "pb-hud";
  root.innerHTML = `<div class="pb-banner" role="status"></div>`;
  parent.appendChild(root);
  const banner = root.querySelector<HTMLElement>(".pb-banner")!;
  return {
    banner(t) {
      banner.textContent = t;
    },
    gameOver(victory) {
      const el = document.createElement("div");
      el.className = "pb-over";
      el.innerHTML = victory
        ? `<h2>VICTORY</h2><p>The Strait is yours.</p><button>Back to menu</button>`
        : `<h2>DEFEAT</h2><p>Down to Davy Jones' locker…</p><button>Back to menu</button>`;
      el.querySelector("button")!.addEventListener("click", () => {
        window.location.href = "/";
      });
      root.appendChild(el);
    },
    dispose() {
      root.remove();
      style.remove();
    },
  };
}
