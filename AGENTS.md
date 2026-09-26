# AGENTS.md — Battleship (interview take-home)

Read this first, then `docs/requirements.md` and `docs/build-manual.md`. Those two docs are the source of truth; this file is the short version.

## The assignment
Build a Battleship game playable online against an AI; debug it and document bugs in `docs/BUGS.md`; publish code in a public GitHub repo. Deliverables: live URL, BUGS.md, public repo, debrief notes.

## Decisions (locked 2026-09-26 — do not change without the user)
- **Rules:** classic Hasbro only (requirements §1, verified against the PDF). 10x10, rows A–J, cols 1–10. Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2. Horizontal/vertical only, no overlap, on-grid, ships may touch. One shot per turn, turn ends after hit or miss. **Defender names the ship on every hit** ("Hit. Cruiser."). Owner announces sinks. First to sink all 5 wins. Human fires first. Repeat shots are rejected (not a wasted turn).
- **No variants** (Salvo, hints, reveals, super shot): requirements §6.1 lists them as debrief talking points only. Keep all rules in one config object so variants could be added later, but build none.
- **v0.1 scope:** all "Must" functional requirements (requirements §5) + Easy and Medium AI. Hard (F16) and Adaptive Hard (F18) are later.
- **Stack:** TypeScript (strict) + Vite, no UI framework; Vitest; ESLint; GitHub Actions CI.
- **Hosting:** Vercel, Git-connected (auto-deploy `main`, preview per branch). Game at `/`, planning site at `/plan/`.
- **Architecture:** client-only for v0.1. Server-authoritative (Vercel Functions + encrypted state token or KV) is the documented production design, not built.
- **AI:** deterministic algorithms, not ML. The AI gets only its own shot history (`hit`/`miss`, ship name on hits, sunk list), never the opponent board. Medium = checkerboard hunt + target, hits grouped by ship name.

## Layout
- `src/engine/` — pure game rules, no DOM
- `src/ai/` — pure AI functions, no DOM, no access to opponent board
- `src/ui/` — rendering and input only; no rule logic
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
