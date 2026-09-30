# Captain's Gambit — Overview

Context: "Pirate Battleship" is a browser Battleship game against an AI, built in TypeScript + Vite + three.js (repo: `~/battleship-game`, public on GitHub). It's a pirate-themed take on classic Hasbro Battleship, set in "The Drowned Strait". It has two modes, **Standard** (classic rules) and **Gambit** (this document). The source of truth is `docs/requirements.md` §1A; this file summarises it and adds the current build status.

---

## What it is

An optional second mode. In **Standard**, the game is classic Battleship. In **Gambit**, each side has a pirate captain with one special power (a "Gambit") usable **once per game**. Board and fleet are identical in both modes: 10×10 and the same five ships (Man-o'-War 5, Galleon 4, Frigate 3, Brigantine 3, Sloop 2).

## Rules for every Gambit

- Using a Gambit **is your turn**; you don't also fire normally. The exception is Crow's Nest, which is a free action followed by a normal shot.
- It's announced to the opponent by name ("Cap'n invokes Powder Keg!").
- Every shot a Gambit fires follows normal rules: miss, or hit with the ship named, and sinks are announced. Already-fired squares can't be fired at again.
- If a Gambit sinks the last ship, the game ends immediately.
- It never reveals more than the power states.
- The first player alternates on every rematch, to offset the first-move advantage.

## The four captains

| Captain (fleet colour, portrait) | Gambit | What it does | Limits |
|---|---|---|---|
| **Broadside**, the Gunner (green; dreadlocks, war paint) | **Broadside** | Fires 3 shots at any 3 untried squares, resolved in order | All 3 must be untried. Stops early if it wins |
| **Powder Keg**, Demolitions (red; woman in skull tricorn) | **Powder Keg** | Plus-shaped blast: target square + its 4 neighbours, clipped at the board edge | **Open water only:** every blast square must be untried, and none may touch a known hit on a ship not yet sunk. So it finds ships but can't finish one you've already found. Hits on a ship that has since escaped with Ghost Ship don't count |
| **Crow**, the Navigator (blue; young tricorn pirate) | **Crow's Nest** | Free scout: pick a 3×3 area and learn *how many* ship squares are in it (a number only, no positions or names), then fire normally | Area clipped at the edges; squares already hit count too |
| **Ghost**, the Trickster (black; skull-faced pirate) | **Ghost Ship** | Moves one of your own ships that isn't sunk (damaged is fine) to a new legal spot and **repairs one hit**. The opponent learns which ship escaped, not where | The new spot can't cover any square the opponent has fired at, so their misses stay true |

Captain names are placeholders. Final original names, flags, bios and voice lines are still to come (no real or trademarked characters). Portraits are photoreal art supplied by the owner (`public/assets/captains/`). Each fleet's ship colour matches its captain.

Design notes:
- Powder Keg is a plus shape (5 cells), not a 3×3 (9), so it stays balanced against Broadside's 3 shots.
- Earlier versions were changed for being too weak: Crow's Nest originally cost a turn, and Ghost Ship could only move un-hit ships.
- A larger 12×12 Gambit board was considered and rejected: games ran ~40% longer, the mobile layout got tighter, and it would have added a second surface to balance.

## How the AI plays it

- It picks a random captain, different from the player's if possible. In Standard mode the AI's captain is cosmetic only (portrait, flag, banter).
- It uses its Gambit by simple, testable rules, based only on information a human would have (it never sees the opponent's board):
  - **Broadside:** after 10 of its turns, while not chasing a damaged ship, on 3 of its best search squares.
  - **Powder Keg:** while searching, on the legal spot whose blast covers the most untried squares.
  - **Crow's Nest:** from turn 5 while searching, on the 3×3 with the most untried squares. It then concentrates its search there and still fires that turn.
  - **Ghost Ship:** once one of its ships has 2 hits (a Sloop at 1), it moves the most damaged ship to a random legal spot.
- When the *player's* ship escapes via Ghost Ship, the AI treats its old hits on that ship as history and hunts the ship again. Powder Keg legality is judged the same way for both sides.

## Balance (measured, not guessed)

`npm run balance` plays 16,000 AI-vs-AI games (Medium vs Medium, all 16 captain pairings × 1,000 seeded games, alternating the first player). The target is that every captain wins 45–55%.

| Captain | First run | Final |
|---|---|---|
| Broadside | 52.2% | **51.4%** |
| Powder Keg | 54.6% | **53.4%** |
| Crow's Nest | 48.7% | **47.3%** |
| Ghost Ship | 44.5% ✗ | **47.9%** (49.6% moving first, 46.1% second) |

Ghost was out of band, so four fixes were measured on identical seeds:

| Fix | Ghost win rate |
|---|---|
| AI waits for 2 hits | 45.7% |
| AI waits until one hit from sinking | 44.5% (no gain) |
| Ghost Ship repairs 1 hit | 46.6% |
| Both combined | **47.9%**, chosen |

With the chosen fix, the spread between the strongest and weakest captain narrowed from 10.1 to 6.1 points. For reference, in Standard mode the first player wins 51.9%, and a game averages 88 total shots. Full tables: `docs/balance-results.md`.

## Decisions log (relevant rows)

| # | Question | Decision |
|---|---|---|
| 13 | Gambit mode | In v0.1, behind a mode choice; Standard is the default |
| 14 | AI gets a captain | Yes: random captain, rule-based Gambit use |
| 17 | Gambit board size | 10×10, same as Standard |
| 19 | Modes | "Standard" and "Gambit"; captain select in both, powers only in Gambit |
| 25 | AI captain in Standard mode | Random, cosmetic only |
| 26 | Ghost Ship balance fix | Repairs 1 hit; the AI uses it at 2 hits (Sloop: 1) |
| 27 | Powder Keg vs an escaped ship | Old hits on a relocated ship no longer block Powder Keg; hits on its new position do |
| 33 | Fleet colours | Crow = blue, Powder Keg = red, Broadside = green, Ghost = black |

## Build status

**Done and tested:**
- **Game engine** (`src/engine/gambit.ts`, `src/engine/captains.ts`): all four Gambits with every restriction, once-per-game, board-edge clipping, a Gambit winning mid-volley, and relocation history for Powder Keg. With Gambit off, no Gambit code runs, and the Standard-mode test suite passes unchanged.
- **AI** (`src/ai/gambitAi.ts`, `src/ai/captain.ts`): captain choice and all four usage rules. It never attempts an illegal Gambit or uses one twice; a lint rule and a test keep the AI from seeing the game state.
- **Balance script** (`tests/balance/balance.sim.ts`, `npm run balance`).
- Test suite: 191 tests passing, ~97% engine/AI coverage, CI on every push.

**Not built yet (on screen):**
- The Standard / Gambit mode choice and the captain select screen (in both modes, with a "hero shot" on the chosen captain).
- The Gambit button in battle with Ready / Unavailable (with reason, e.g. "Only in open water") / Spent states.
- Aiming previews: 3 picks for Broadside, the plus-shaped blast outline (invalid squares flagged) for Powder Keg, a 3×3 box for Crow's Nest, and dragging/rotating a ship for Ghost Ship.
- 3D effects and announcements for each Gambit, and captain portraits reacting in battle.
- The player's fleet colour following their chosen captain (currently always blue).

Planned order: ship placement on the 3D board, then mode and captain select, then the Gambit UI.
