# Battleship: Step-by-Step Build Manual (Vibe Coding with Devin)

How to use this: work top to bottom. Each step has a goal, what to do, a copy-paste prompt for Devin where relevant, and a "done when" check. Don't skip gates. Log every bug in `docs/BUGS.md` the moment you find it.

Rules for vibe coding this project:
- **You are the Orchestrator.** Devin writes code; you decide, review every diff, and must be able to explain every line in the debrief.
- **Small prompts, small diffs.** One feature per prompt. Commit after each green step.
- **Tests before UI.** The engine is proven by tests before anything is drawn on screen.
- **Hasbro rules only.** If a prompt result adds rules you didn't ask for, reject it.

---

## Phase 0: Environment & Repo Setup

### Step 0.1 — Install tools
- Install **Node.js LTS** and the **GitHub CLI** (done 2026-09-26: user-local in `~/.local`, on PATH via `~/.zshrc`; no Homebrew or sudo needed).
- Set git identity: `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"` (use your GitHub noreply address from github.com → Settings → Emails to keep your email private).
- Authenticate: `gh auth login` → GitHub.com → HTTPS → login with browser.

Done when: `node -v`, `npm -v`, `gh auth status` all succeed.

Note: the GitHub integration in Devin's web settings powers Devin Cloud sessions. Pushing from your own Mac terminal still needs `gh auth login` (or an SSH key) locally.

### Step 0.2 — Create the public repo
```
cd ~/battleship-game
gh repo create battleship-game --public --source=. --remote=origin
```
Done when: the repo exists at github.com/<you>/battleship-game and `git remote -v` shows origin.

### Step 0.3 — Commit the planning docs first
Commit `docs/requirements.md`, `docs/build-manual.md`, and the planning webpage. This shows reviewers you planned before coding.

---

## Phase 1: Discovery & Rules Lock (Gates 1–2)

### Step 1.1 — Answer the five gating questions
Fill rows 1–5 of the Decision Log in the requirements doc.

### Step 1.2 — Verify rules against the Hasbro PDF
Open hasbro.com/common/instruct/battleship.pdf and check Section 1 line by line. Answer the digital-only decisions (first move, repeat shots, forfeit).

Done when: Decision Log rows 1–8 are filled; out-of-scope list is confirmed.

---

## Phase 2: Architecture Lock (Gate 3)

### Step 2.1 — Pick the stack
Recommended default (simple, explainable, zero cold starts):
- **Vite + TypeScript**, no UI framework (or React if you prefer)
- **Vitest** for tests
- **Vercel** for hosting (Git-connected; auto-deploys `main`, preview URL per branch); GitHub Actions for CI (lint + test)
- Engine as a pure module (`src/engine/`), AI as a pure module (`src/ai/`), UI separate (`src/ui/`)

### Step 2.2 — Decide client-only vs server-authoritative
Use requirements Section 4.1. Recommended: client-only MVP, server-authoritative documented as the production design.

Done when: Decision Log rows 9–12 filled.

---

## Phase 3: Design Lock (Gate 4)

### Step 3.1 — Wireframe five screens
Start → Choose Your Captain (Gambit mode only) → Placement → Battle → Game Over. Sketch on paper or ask Devin for a static HTML mock (no logic).

Prompt:
> Create a static, non-functional HTML/CSS mockup of a pirate-themed Battleship game (requirements §1B: parchment sea chart, wood/rope/brass, pirate copy, pirate ship names) with five screens: Start ("Set Sail"; difficulty Deckhand/Buccaneer; "Captain's Gambit: Off/On" switch), Choose Your Captain (4 captain cards with placeholder names, portrait frame, Gambit name and one-line description; shown only when Gambit is On), Placement (10x10 ocean grid, ship list, Rotate and Randomize buttons), Battle (Target Grid and Ocean Grid side by side on desktop, stacked on mobile under 700px, turn indicator, move log, fleet status, and in Gambit mode a captain portrait frame beside each grid plus a Gambit button with Ready/Unavailable/Spent states), Game Over (winner, stats, Rematch). Rows A–J, columns 1–10. Hits shown with X, misses with a dot, so they are distinguishable without color. No JavaScript game logic.

Done when: you approve the layout on desktop and at 360 px width.

### Step 3.2 — MVP Definition (Gate 5)
Confirm the Definition of Done in the requirements doc. **Build begins now.**

---

## Phase 4: Scaffold

### Step 4.1 — Project scaffold
Prompt:
> In this repo, scaffold a Vite + TypeScript project with Vitest and ESLint, plus three.js as the only runtime dependency. Create folders src/engine, src/ai, src/ui, src/scene, src/audio, and tests. Add a minimal three.js smoke scene (RTS-angle camera over an animated ocean plane) to prove the 3D pipeline builds and deploys. Add npm scripts: dev, build, test, lint. Add a GitHub Actions workflow that runs lint and test on every push and pull request. Replace the root index.html (currently a redirect to the planning site) with the Vite app entry, and make scripts/build_page.py also write the planning site to public/plan/index.html so it deploys at /plan/. Do not write any game logic yet.

Done when: `npm install && npm test && npm run build` succeed; CI is green on GitHub.

---

## Phase 5: Game Engine (TDD)

### Step 5.1 — Data model
Prompt:
> In src/engine, define TypeScript types for a classic Hasbro Battleship game: a 10x10 board (rows A–J, cols 1–10), the five ships (Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2), orientation (horizontal/vertical only), shot results (hit, miss, sunk), and game state (both players' boards, shots, whose turn, status, winner). No UI code.

### Step 5.2 — Placement rules + tests
Prompt:
> Implement placeShip and randomPlacement in src/engine with Vitest tests first. Rules: horizontal or vertical only, must stay fully on the 10x10 board, ships may not overlap, ships may touch. placeShip returns a result with an error reason on failure. Add a property test that runs randomPlacement 10,000 times and asserts every fleet is valid and has exactly 17 occupied cells.

### Step 5.3 — Firing, sinking, winning + tests
Prompt:
> Implement fire(state, player, row, col) in src/engine with tests first. It must: return miss, or hit with the name of the ship that was hit (Hasbro rules: the defender names the ship on every hit); return sunk with the ship name when the last cell of a ship is hit; set the winner when all 5 ships are sunk; reject out-of-bounds shots, repeat shots on the same cell, shots out of turn, and any shot after the game is over, without changing state. Alternate turns after every valid shot (one shot per turn, no extra turn on hit).

### Step 5.4 — Captain's Gambit engine + tests
Prompt:
> Add Captain's Gambit to src/engine exactly as specified in requirements §1A.1–1A.3, tests first. Add `rules.gambit` (default false) to the rules config; with it false no Gambit code path runs and every existing test passes unchanged. Add the four captain IDs (captain-broadside, captain-powderkeg, captain-crowsnest, captain-ghostship) with placeholder display names, and a `useGambit(state, player, params)` that: counts as the player's whole turn; is usable once per game; resolves Broadside (3 distinct untried cells, in order, stop if game won), Powder Keg (plus-shaped blast clipped at edges; rejected unless every in-bounds cell is untried and none touches a known hit on an un-sunk ship), Crow's Nest (free action that does not end the turn; 3x3 clipped; returns only the count of ship cells), Ghost Ship (move one of your ships that is not sunk, damaged allowed, keeping its damage, to a legal position covering no cell the opponent has fired at; the opponent is told which ship moved, not where; its old hits stay in their history). First player alternates on every Rematch. Every shot fired by a Gambit reports miss / hit with ship name / sunk like a normal shot. Illegal uses return a reason and change no state. Test each Gambit's legal case, each restriction, once-only, board-edge clipping, and a Gambit that wins the game.

Done when: all engine tests pass (classic suite unchanged with Gambit off); coverage ≥ 90% on src/engine.

---

## Phase 6: AI Opponent

### Step 6.1 — Easy AI
Prompt:
> In src/ai, implement an Easy AI that picks a uniformly random cell it has not fired at before. It receives only its own shot history and results (hit/miss/sunk), never the opponent's ship positions. Add tests: it never repeats a cell and never fires off-board over 1,000 simulated games.

### Step 6.2 — Medium AI (hunt/target)
Prompt:
> Add a Medium AI in src/ai using hunt/target: hunt randomly (optionally parity/checkerboard) until a hit; then target adjacent cells; once two hits line up, continue along that line in both directions; because Hasbro rules name the ship on every hit, group hits by ship name and target each damaged ship separately; when a ship is reported sunk, clear only that ship's hits and keep targeting any other damaged ship before resuming the hunt; use the lengths of ships still afloat to bound the search. Uses only shot results. Add tests for: following a line after two hits, reversing direction at a miss, two adjacent hits on different ships treated as separate targets, continuing to chase a damaged ship after sinking a different one, returning to hunt after a sink, and a simulation showing Medium averages fewer shots to win than Easy over 500 games.

### Step 6.3 — AI captain and Gambit use
Prompt:
> In src/ai, add Gambit-mode behaviour per requirements §1A.4: the AI picks a random captain (different from the player's if possible) and decides when to use its Gambit with the stated rules (Broadside after turn 10 in hunt mode; Powder Keg on the legal open-water cell covering the most untried cells; Crow's Nest as a free action after turn 5 in hunt mode, then weights hunting by the count and still fires; Ghost Ship relocates a ship right after it takes its first hit and is not sunk). Use only information a human would have. When the player's ship is announced as relocated, Medium drops that ship's hits from its targets and treats it as unfound with its remaining length. Tests: each decision rule triggers when expected, the AI never attempts an illegal Gambit, never uses it twice, and full simulated Gambit games always terminate with a winner.

Then add the balance test from requirements §1A.6: a headless `npm run balance` script that plays Medium vs Medium for all 16 captain pairings (≥ 1,000 seeded games each, alternating first player) and prints win rates overall and by move order, plus average game length. Target: every captain 45–55%. If not, tune one parameter, rerun, and record the final table in the README.

### Step 6.4 (optional) — Hard AI (probability density)
Only after MVP is done and deployed.

---

## Phase 7: User Interface

### Step 7.1 — Wire placement screen
> Build the Placement screen in src/ui using the approved mockup. Click a ship, hover to preview (valid vs invalid shown with both color and pattern), click to place, R key or button to rotate, Randomize button, Start disabled until all 5 ships placed. All validation calls the engine; the UI holds no rule logic.

### Step 7.2 — Wire battle loop
> Build the Battle screen. Human clicks a Target Grid cell to fire; input is locked until the AI finishes its turn (with a ~500 ms delay). Show hit (X) with the name of the ship hit ("Hit. Cruiser."), miss (dot), sunk announcements for both sides ("You sank my Cruiser!"), a move log, and fleet status. Already-fired cells are not clickable. Double-clicks must never fire twice.

### Step 7.3 — Game over & rematch
> Build the Game Over screen: winner, shots fired, accuracy, reveal the AI fleet, Rematch button that fully resets state.

### Step 7.4 — Accessibility pass
> Make the game fully keyboard-playable (arrow keys move a focus cursor, Enter fires/places, R rotates), add ARIA labels to every cell (e.g. "B7, miss"), ensure WCAG AA contrast, respect prefers-reduced-motion.

### Step 7.5 — Pirate theme pass
> Apply the pirate theme from requirements §1B across every screen: parchment sea-chart grids, wood/rope/brass frames, compass rose, pirate copy for all messages, difficulty names Deckhand/Buccaneer, and pirate ship display names (Man-o'-War 5, Galleon 4, Frigate 3, Brigantine 3, Sloop 2) mapped from the engine's Hasbro IDs in the UI layer only. Keep hit/miss markers distinguishable without colour and keep plain coordinates in ARIA labels and the move log (e.g. "B7: hit, Frigate"). No raster images; SVG and CSS only.

### Step 7.6 — Captain's Gambit UI
> Build the Gambit UI per requirements §1A: the "Captain's Gambit" switch on Start (default Off, remembered in localStorage), the Choose Your Captain screen (4 cards), and in Battle a Gambit button with Ready / Unavailable (with reason) / Spent states, a targeting preview for each Gambit (3 picks for Broadside, plus-shaped blast preview for Powder Keg with invalid cells flagged, 3x3 box for Crow's Nest, ship drag/rotate for Ghost Ship), announcements for both sides, and the AI's captain and Gambit use shown in the log. All legality comes from the engine.

### Step 7.7 — Name the captains and animate their portraits
> Name the four captains following the naming brief in requirements §1A.5: original pirate names, pronounceable, distinct first letters, matching each archetype (Gunner, Demolitions, Navigator, Trickster); no real people or existing fictional/trademarked characters. For each captain write a flag (colour + emblem), a one-line bio, and short voice lines (select, hit, miss, sink, Gambit, victory, defeat). Then create an original animated bust portrait for each in the spirit of StarCraft/Warcraft unit portraits, as layered inline SVG with CSS keyframes: idle loop (breathing, blinking, one signature detail), talking, hit taken, hit made, Gambit wind-up, victory, defeat. ≤ 40 KB per captain, lazy-loaded only in Gambit mode, static under prefers-reduced-motion. Update requirements Decision Log row 16 with the chosen names.

Steps 7.1–7.7 build the **2D chart UI** first: the always-available, accessible way to play (and the fallback when WebGL2 is missing). Steps 7.8–7.13 layer the 3D RTS experience from requirements §1C on top of it. The 3D scene renders engine state only.

### 7.8 — Screen flow and RTS menus
> Implement the §1C.1 screen flow in src/ui: intro video placeholder (skippable, once per session, silently skipped if public/video/intro.mp4 is missing, via a reusable playCutscene(id)), RTS-style main menu (Set Sail, Settings, Credits) with beveled brass/wood buttons, the Mode & Difficulty screen (Standard / Gambit cards, Deckhand / Buccaneer, remembered in localStorage), and Choose Your Captain in both modes (Gambit text shown only in Gambit mode). Settings: graphics quality, music and SFX volume, reduced motion.

### 7.9 — Ocean, sky, lighting
> In src/scene, build the ocean per §1C.3: a Gerstner-wave vertex shader (4–8 directional waves by quality tier), Fresnel sky reflection, subsurface tint, crest foam, and sun glint; three's Sky driving the sun and a PMREM environment; ACES tone mapping; shadows. Export a CPU `sampleWave(x, z, t)` that uses the same wave parameters as the shader, and unit-test it (deterministic, and it matches the parameters table). Add the RTS camera from §1C.2 (pan, zoom clamps, Q/E rotate, recenter, damping). Lazy-load the scene after the menu's first paint.

### 7.10 — Pirate ships
> Build the five procedural ship styles from §1B (Man-o'-War, Galleon, Frigate, Brigantine, Sloop) behind a `ShipModel` interface, with PBR wood/canvas/brass materials, sail and flag flutter in a vertex shader, and captain flags. Ships ride the swell using sampleWave (pitch, roll, heave). Place them on the grid plane in the player's waters from engine state; enemy ships spawn only when the engine reveals them (hit, sink, game over).

### 7.11 — Combat effects and 3D input
> Raycast cell picking on the grid plane goes through the same UI command path as the 2D chart. Effects: muzzle flash + smoke, projectile arc, splash column (miss), fire and smoke (hit), list-and-sink (sunk), camera shake off under reduced motion. Fog of war over enemy waters. Game Over camera sweep.

### 7.12 — Music and SFX
> In src/audio, build a `MusicPlayer` with two procedural Web Audio tracks (§1C.5): a home theme and a battle theme, crossfaded on screen changes, started on the first user gesture, and controlled by the persisted volume/mute settings. Add synthesized SFX (cannon, splash, impact, creak, wave bed). The interface should allow swapping in licensed audio files later.

### 7.13 — Quality tiers and fallback
> Add Low / Medium / High tiers (auto-detected plus a frame-time probe, overridable in Settings) that scale wave count, shadow size, pixel ratio, particles and post-processing (bloom, vignette, FXAA). Without WebGL2, skip the scene and use the 2D chart UI. Verify ≥ 30 fps at Low in a throttled mobile emulation and 60 fps at High on desktop.

Done when: full game playable with mouse, touch, and keyboard only, in both Standard and Gambit modes, with every captain, in 3D and in the 2D fallback; music plays on the menu and in battle.

---

## Phase 8: Debugging & Bug Log (Deliverable D2)

### Step 8.1 — Structured test pass
Run every case in requirements Section 3, Role 6. Play at least 10 full classic games (win and lose, Easy and Medium, desktop and phone), plus at least one Gambit-mode game with each of the 4 captains.

### Step 8.2 — Log each bug in docs/BUGS.md
Template per bug:
```
## BUG-00X: <short title>
- Symptom: what the player saw
- Steps to reproduce:
- Root cause: why it happened (file/function)
- Fix: what changed (commit link)
- Verification: test added / manual check
```

Prompt to use when you find one:
> Bug: <symptom and repro steps>. First write a failing test that reproduces it, then find the root cause, fix it, and confirm the test passes. Explain the root cause in one paragraph I can paste into docs/BUGS.md.

Common Battleship bugs to hunt for: double-click fires twice; AI fires same cell twice; sink not detected when ships touch; turn doesn't pass after a sink; game continues after win; rotation lets ship hang off board; Rematch keeps old state; mobile grid overflows; stale closures firing shots after game over. Gambit-mode bugs to hunt for: Gambit usable twice; Gambit plus a normal shot in one turn; Powder Keg allowed next to a found ship or on fired cells; edge-clipped blast firing off-board; Broadside continuing after the win; Crow's Nest leaking positions or ship names; Ghost Ship moving a sunk ship, losing a moved ship's damage, or landing on fired cells; Crow's Nest ending the turn; AI Medium chasing a ship that ghosted away; Gambit state surviving Rematch; Classic mode showing any Gambit UI.

---

## Phase 9: Deploy (Deliverable D1)

### Step 9.1 — Vercel
One-time, in the browser (you): vercel.com → sign in with GitHub → Add New → Project → import `battleship-game` → Framework Preset: Vite (auto-detected; build `npm run build`, output `dist`) → Deploy. From then on every push to `main` deploys to production and every branch gets a preview URL.

Prompt (optional hardening):
> Add a minimal vercel.json only if needed (e.g. security headers); keep Vite's default base path "/". Confirm `npm run build` produces dist/ with the game at / and the planning site at /plan/.

Done when: `https://<project>.vercel.app/` loads in an incognito window on desktop and phone, and a full game completes with zero console errors.

---

## Phase 10: Repo Polish (Deliverable D3)

- README: what it is, live link, how to play, how to run locally, architecture diagram (engine / AI / UI), key trade-offs (client-only vs server-authoritative), testing approach, link to BUGS.md, what's next.
- Clean commit history with meaningful messages.
- CI badge in README.
- Confirm repo is public (`gh repo view --web`).

---

## Phase 11: Debrief Prep (~10 min)

Outline:
1. What I built + live demo (2 min)
2. How I scoped it: requirements, Hasbro rules only, MoSCoW (2 min)
3. Architecture + the hidden-information trade-off (2 min)
4. Bugs found and how I fixed them (2 min)
5. How I used Devin / what I'd do next: Hard AI, Adaptive Hard, server authority on Vercel Functions, multiplayer (2 min)

Framing line for the AI question: "The opponent is a deterministic algorithm (hunt/target, later probability density), not ML: it's stronger here, instant, testable, and can't cheat. AI was how I *built* it: Devin wrote code and tests from my specs; I reviewed and debugged every diff."

## Final Submission Checklist
- [ ] Live URL (D1)
- [ ] docs/BUGS.md link (D2)
- [ ] Public GitHub repo link (D3)
- [ ] Debrief outline (D4)
- [ ] Sent to hiring manager
