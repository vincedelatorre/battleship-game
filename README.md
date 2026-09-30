# Battleship — Interview Project

**Repo:** https://github.com/vincedelatorre/battleship-game

A pirate-themed Battleship game played against an AI, rendered as a 3D
naval battle on a live ocean. Classic Hasbro rules plus an optional
**Captain's Gambit** mode where each side fields a captain with a
once-per-game power.

Built with TypeScript (strict) + Vite, **three.js** as the only runtime
dependency, Vitest for the engine/AI test suite, and ESLint.

## Modes

- **Standard** — classic 10x10 Battleship. Carrier 5, Battleship 4,
  Cruiser 3, Submarine 3, Destroyer 2 (displayed in-theme as Man-o'-War,
  Galleon, Frigate, Brigantine, Sloop). One shot per turn, defender names
  the ship on every hit, owner announces sinks.
- **Captain's Gambit** — same board and fleet, but each side picks one of
  four captains, each with a once-per-game Gambit that consumes the turn:
  - **Broadside** (Ozias Drum) — three untried shots, resolved in order
  - **Powder Keg** (Tamsin Kindle) — plus-shaped blast on open water
  - **Crow's Nest** (Silas Wren) — free 3x3 ship-cell count, then a
    normal shot
  - **Ghost Ship** (Vesper Hollow) — relocate a not-sunk ship onto
    un-fired cells and repair one hit

Gambit balance is verified by simulation (`npm run balance`); every
captain's win rate sits in the 45–55% band.

## What's built

- Pure engine (`src/engine/`) — rules only, no DOM
- Deterministic AI (`src/ai/`) — Easy and Medium; Medium uses
  checkerboard hunt + target with hits grouped by ship name. The AI only
  ever sees its own shot history, never the opponent board.
- 3D board (`src/scene/`) — stormy ocean grid, floating fleets with
  waterline/foam/shadow depth cues, pirate-glyph row/column legends
- Storm main menu — live night-ocean three.js scene with captains
- Setup flow — mode, difficulty and captain select
- Ship placement, battle session flow, fleet sidebar with hit tracking,
  "Your waters" mini-chart and Captain's Log

## Commands

```sh
npm run dev       # dev server
npm test          # Vitest suite (224 tests)
npm run lint
npm run build     # tsc --noEmit + vite build
npm run preview   # serve the production build
npm run balance   # Gambit captain win-rate simulation
```

## Docs

- [Requirements & Discovery](docs/requirements.md) — source of truth
- [Build Manual](docs/build-manual.md) — phased build plan
- [Gambit Overview](docs/gambit-overview.md) — mode rules, captains, AI,
  balance results
- [Balance Results](docs/balance-results.md)
- [Interactive planning page](docs/index.html) — search, checklists,
  decision log (also deployed at `/plan/`)

Regenerate the planning page after editing the docs:

```sh
python3 scripts/build_page.py
```

## Layout

- `src/engine/` — pure game rules, no DOM
- `src/ai/` — pure AI functions; never sees the opponent board
- `src/ui/` — DOM screens, HUD, 2D charts, input; no rule logic
- `src/scene/` — three.js scene; renders engine state only
- `src/audio/` — music and SFX
- `tests/` — Vitest
- `docs/` — requirements, build manual, planning site
