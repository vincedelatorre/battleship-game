# AGENTS.md — Battleship (interview take-home)

Read this first, then `docs/requirements.md` and `docs/build-manual.md`. Those two docs are the source of truth; this file is the short version.

## The assignment
Build a Battleship game playable online against an AI; debug it and document bugs in `docs/BUGS.md`; publish code in a public GitHub repo. Deliverables: live URL, BUGS.md, public repo, debrief notes.

## Decisions (locked 2026-09-26 — do not change without the user)
- **Rules:** classic Hasbro only (requirements §1, verified against the PDF). 10x10, rows A–J, cols 1–10. Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2. Horizontal/vertical only, no overlap, on-grid, ships may touch. One shot per turn, turn ends after hit or miss. **Defender names the ship on every hit** ("Hit. Cruiser."). Owner announces sinks. First to sink all 5 wins. Human fires first in the first game; first player alternates on every Rematch. Repeat shots are rejected (not a wasted turn).
- **No variants** (Salvo, hints, reveals): requirements §6.1 lists them as debrief talking points only. Keep all rules in one config object so variants could be added later, but build none.
- **Captain's Gambit mode (requirements §1A), in v0.1:** toggle `rules.gambit`, default Off; Off = pure classic, and the classic test suite must pass unchanged. On = each side picks 1 of 4 captains, each with one once-per-game Gambit that uses the whole turn: Broadside (3 shots), Powder Keg (plus-shaped blast, open water only), Crow's Nest (free action: 3x3 ship-cell count, then a normal shot), Ghost Ship (relocate a not-sunk ship, damage kept, onto un-fired cells; ship name announced). Balance is verified by the §1A.6 simulation (`npm run balance`, every captain 45–55%). First player alternates on Rematch. Gambit mode uses the same 10x10 board and fleet as Classic (12x12 was rejected). The AI gets a random captain and uses its Gambit by the rules in §1A.4. Captain names are chosen by Devin during the build per the naming brief in §1A.5 (original names only). Animated portraits in the spirit of StarCraft/Warcraft unit portraits, as original layered SVG + CSS, ≤ 40 KB each, lazy-loaded.
- **Pirate theme everywhere (requirements §1B):** all screens and copy. Ship display names Man-o'-War 5, Galleon 4, Frigate 3, Brigantine 3, Sloop 2, mapped in the UI only; the engine keeps Hasbro IDs. Plain coordinates stay in ARIA labels and the move log.
- **v0.1 scope:** all "Must" functional requirements (requirements §5, incl. F19–F24) + Easy and Medium AI. Hard (F16) and Adaptive Hard (F18) are later. Build order: classic engine → Gambit engine → AI → UI → theme → portraits; keep classic shippable at every step.
- **Stack:** TypeScript (strict) + Vite, no UI framework; **three.js** for the 3D scene (only runtime dep); Vitest; ESLint; GitHub Actions CI.
- **Presentation (requirements §1C):** 3D RTS-style pirate naval battle: StarCraft/Warcraft feel (camera, portraits, menus), Unreal-level realism as the target, all original pirate assets, no RPG systems. Modes: Standard and Gambit; captain select in both. Procedural Web Audio music (home + battle). Intro video and cutscenes (Higgsfield/Runway) come later, and only their plumbing is built now. The 2D chart UI is always playable and is the WebGL2 fallback.
- **Hosting:** Vercel, Git-connected (auto-deploy `main`, preview per branch). Game at `/`, planning site at `/plan/`.
- **Architecture:** client-only for v0.1. Server-authoritative (Vercel Functions + encrypted state token or KV) is the documented production design, not built.
- **AI:** deterministic algorithms, not ML. The AI gets only its own shot history (`hit`/`miss`, ship name on hits, sunk list), never the opponent board. Medium = checkerboard hunt + target, hits grouped by ship name.

## Layout
- `src/engine/` — pure game rules, no DOM
- `src/ai/` — pure AI functions, no DOM, no access to opponent board
- `src/ui/` — DOM screens, HUD, 2D charts, input; no rule logic
- `src/scene/` — three.js scene; renders engine state/events only, never sees the hidden AI fleet
- `src/audio/` — music and SFX
- `tests/` — Vitest
- `docs/` — requirements, build manual, planning site (`docs/index.html`, generated), `BUGS.md`
- `scripts/build_page.py` — regenerates the planning site from the two .md docs: `python3 scripts/build_page.py`

## Commands (after Phase 4 scaffold)
- `npm run dev` · `npm test` · `npm run lint` · `npm run build`
- Tools are user-local: Node and `gh` in `~/.local` (PATH set in `~/.zshrc`).

## Working rules
- Follow `docs/build-manual.md` phase by phase; one step per prompt.
- Engine and AI are test-first. Don't start UI until engine tests pass.
- Every bug: failing test first, then fix, then an entry in `docs/BUGS.md` (template in build manual Step 8.2) linking the fix commit.
- One commit per green step, clear messages; bug fixes in their own commits. Push after each phase.
- No new dependencies beyond the stack above without asking the user.
- If a docs change affects the planning site, regenerate it with `python3 scripts/build_page.py`.
