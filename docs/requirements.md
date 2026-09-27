# Battleship: Pre-Build Requirements & Discovery Pack

Status: PRE-BUILD. No game code is written until the Orchestrator signs off on Gate 5 (MVP Definition).

## 0. The Assignment (source of truth)

From the interview prompt:

1. Build a Battleship game **we can play online against an AI**. Send a link where we can play it.
2. Be sure the game is **debugged**. Explain in a short document what bugs you found and how they were fixed.
3. Export the code into a **public GitHub repo**. Send the link.
4. Any tools are allowed (Devin Cloud, Devin Desktop, Devin CLI, etc.) **except asking another person to write or edit code**.
5. Debrief on the game is ~10 minutes of the onsite.

Deliverables checklist:

| # | Deliverable | Acceptance |
|---|-------------|------------|
| D1 | Public URL to play | Opens on desktop + phone, no login, full game vs AI playable start to finish |
| D2 | Bug report doc (`docs/BUGS.md`) | Each bug: symptom, root cause, fix, how verified (test/commit link) |
| D3 | Public GitHub repo | README, run instructions, tests, clean history |
| D4 | Debrief talking points | Decisions, trade-offs, what I'd do next (10 min) |

## 1. Game Rules Baseline (Hasbro classic, no extra rules)

> **Change note (verified against the PDF page by page):** Corrected hit reporting (the defender must name the ship on every hit, not only on a sink), who-goes-first (the PDF says "Decide who will go first," not "youngest player"), and labeled Salvo as an official Hasbro variation, because the earlier draft was written from memory before the scanned PDF was read.

Source: Hasbro Battleship instructions (hasbro.com/common/instruct/battleship.pdf; ©1990 Milton Bradley, form 4730, 3 scanned pages). Verified line by line against the PDF. The 10x10 size and A–J / 1–10 labels are shown by the game unit in Figure 3 and the letter-left / number-top convention in Figures 4–6; the text itself never states the grid size.

- **Grids:** Each player has two 10x10 grids. The **Ocean Grid** holds your own fleet. The **Target Grid** tracks your shots at the opponent. Rows lettered A–J, columns numbered 1–10.
- **Fleet (5 ships, 17 cells):**

| Ship (Hasbro rules name) | Length | Displayed pirate name (see 1B) |
|------|--------|--------|
| Carrier | 5 | Man-o'-War |
| Battleship | 4 | Galleon |
| Cruiser | 3 | Frigate |
| Submarine | 3 | Brigantine |
| Destroyer | 2 | Sloop |

- **Placement:** Each ship is placed horizontally or vertically only (never diagonally). Ships may not overlap, may not hang off the grid, and may not be moved once play begins. Ships may touch (classic rules do not forbid adjacency).
- **Turn order:** Players alternate. One shot per turn: call a coordinate (e.g. "B-7").
- **Response:** Opponent answers "miss", or "hit" **and names the ship that was hit** (e.g. "Hit. Cruiser."). Hits are marked red, misses white, on the shooter's Target Grid; the defender marks the hit on their Ocean Grid. After a hit or a miss, the turn is over.
- **Sinking:** When every cell of a ship is hit, it is sunk, and the owner must announce which ship was sunk.
- **Win:** First player to sink all 5 opposing ships wins.
- **Out of scope (explicitly):** Salvo (an official variation in the Hasbro PDF, excluded from MVP; see 6.1), extra turn on hit, power-ups outside Captain's Gambit mode (1A), custom fleets, custom board sizes, diagonal placement.

Digital-only decisions the physical rules don't cover (must be answered at Gate 2):
- Who goes first? (PDF: "Decide who will go first." Digital: human first, coin flip, or choice?)
- Firing at an already-fired cell: blocked in UI and rejected by engine (not a wasted turn).
- Forfeit / restart mid-game: allowed? Counts as loss?

## 1A. Captain's Gambit Mode (optional toggle, in v0.1)

Decided 2026-09-26. With the toggle **Off** (default), the game is exactly Section 1: classic Hasbro. With it **On**, each side picks one of four pirate captains, and each captain carries one special power (a **Gambit**) usable **once per game**. Everything in Section 1 still applies except where a Gambit explicitly overrides it for that one turn.

### 1A.1 Mode select
- Mode screen (1C.1): **Standard** (= Gambit Off, default) or **Gambit** (= Gambit On). Persist the last choice in localStorage.
- Engine config: `rules.gambit: boolean` (same single-rules-config pattern as 6.1). With `gambit: false`, no Gambit code path can run; classic tests must pass unchanged.
- **Choose Your Captain** appears in both modes (1C.1); only in Gambit mode does the captain carry a Gambit.
- Board and fleet are identical to Classic in both modes: 10x10, same 5 ships. A larger Gambit board (12x12) was considered and rejected: games ~40% longer, tighter mobile layout, and a second balance surface, for little gain since the Gambits already differentiate the mode.

### 1A.2 Gambit rules (apply to every captain)
- Once per game per side. Using a Gambit **is** that side's turn (no normal shot that turn), except Crow's Nest, which is a free action followed by a normal shot.
- First player alternates on every Rematch (human first in the first game), to offset first-move advantage.
- The Gambit is announced to the opponent by name before it resolves ("Cap'n invokes Powder Keg!").
- Every shot a Gambit fires follows normal rules: reported as miss, or hit with the ship named; sinks announced; already-fired cells cannot be fired again.
- If a Gambit's shots sink the last ship, the game ends immediately.
- A Gambit button shows three states: Ready, Unavailable (with the reason, e.g. "Only in open water"), Spent.
- Gambits never reveal hidden information beyond what the power states.

### 1A.3 The four captains and their Gambits

Captain names are **placeholders**; final names are chosen during the build (see 1A.5). Captain IDs are stable in code.

| ID | Archetype | Gambit | Exact effect | Restriction |
|----|-----------|--------|--------------|-------------|
| `captain-broadside` | Gunner | **Broadside** (triple shot) | Fire 3 shots at 3 different untried cells, anywhere, resolved in the order chosen; each result announced | All 3 cells must be untried. Stops early if the game is won |
| `captain-powderkeg` | Demolitions | **Powder Keg** (small blast radius) | Plus-shaped blast: target cell + 4 orthogonal neighbours (clipped at the board edge); every in-bounds cell is fired at | **Open water only:** every in-bounds blast cell must be untried, and no blast cell may touch (orthogonally) a known hit on a ship not yet sunk. So it cannot be used to finish a ship already found. Hits on a ship that has since escaped with Ghost Ship no longer count, because that ship isn't there any more (decision 27) |
| `captain-crowsnest` | Navigator | **Crow's Nest** (scout) | **Free action:** choose a 3x3 area and learn how many ship cells are in it (a number only: no positions, no names), then take your normal shot. No damage | Area clipped at edges; counts cells already hit too |
| `captain-ghostship` | Trickster | **Ghost Ship** (escape) | Move one of your own ships that is **not sunk** (damaged is allowed) to a new legal position, and **repair one hit** (e.g. a Frigate hit twice needs 2 more hits after moving; a Frigate hit once is fully repaired). The repair was added after the balance test (1A.6). Announced with the ship's name ("The Frigate slipped away!"), but not its new position. Earlier hits stay on the opponent's Target Grid as history | New position must be legal (Section 1) and may not cover any cell the opponent has already fired at. So the opponent's misses stay true |

Powder Keg stays a plus (5 cells), not 3x3 (9 cells), to keep it balanced against Broadside's 3.

Balance rationale (analytical estimate, to be confirmed by 1A.6): Powder Keg ≈ +4 hunt shots, Broadside ≈ +2 flexible shots, Crow's Nest free information, Ghost Ship erases the opponent's lead on a found ship (≈ 3–6 of their shots). The original Crow's Nest (cost a turn) and Ghost Ship (un-hit ships only) were judged too weak and changed.

### 1A.4 AI captain
- In Gambit mode the AI picks a random captain (different from the player's if possible) and shows it in its portrait frame.
- AI uses its Gambit with a simple, testable rule, using only information a human would have:
  - Broadside: in hunt mode (no damaged ship pending) after turn 10, on the 3 best hunt cells.
  - Powder Keg: in hunt mode, on the legal open-water cell whose blast covers the most untried cells.
  - Crow's Nest (free action): in hunt mode on its first turn after turn 5, on the 3x3 with the most untried cells; the count then weights its hunting, and it still fires that turn.
  - Ghost Ship: as soon as one of its ships has at least 2 hits and is not sunk (a Sloop qualifies at 1 hit, since 2 would sink it), it relocates that ship (the most damaged one first) to a random legal position. Moving earlier erased too little of the opponent's progress; see 1A.6.
- Medium AI must handle the player's Ghost Ship correctly: when a ship is announced as relocated, drop that ship's hits from its target list (they are history now) and treat the ship as unfound with its remaining length; misses stay valid.

### 1A.5 Captain identity, naming brief, portraits
- **Naming (done by Devin during the build):** four original pirate names, pronounceable, distinct first letters, fitting each archetype. No real people, no existing fictional or trademarked characters (e.g. no Jack Sparrow, Davy Jones, Hook). Each captain also gets: a flag (colour + emblem), a one-line bio, and short voice lines for select, hit, miss, sink, Gambit, victory, defeat.
- **Portraits: photoreal** (decision 30). Each captain has a realistic portrait in a framed panel, **in the spirit of** StarCraft / Warcraft unit portraits (the talking-head window). The art is supplied by the project owner, who holds the rights, and lives in `public/assets/captains/`:

| Captain | Look | File |
|---|---|---|
| Ghost Ship (Trickster) | Skull-faced undead pirate, flintlock | `captain-ghost.jpg` |
| Crow's Nest (Navigator) | Young, clean-cut, tricorn, cutlass | `captain-crow.jpg` |
| Broadside (Gunner) | Dreadlocks, war paint, grey beard | `captain-broadside.png` (low-res; a higher-res version is wanted) |
| Powder Keg (Demolitions) | Woman in an ornate skull tricorn | `captain-powderkeg.png` (low-res; a higher-res version is wanted) |

  - The captain display names are still chosen per the naming brief above. Portrait IDs map to captain IDs, not to names.
  - **States:** idle, talking (when a voice line appears), reacting to hits taken, celebrating hits made, Gambit wind-up, victory, defeat.
  - **Tech (v0.1):** the photo is animated in CSS/WebGL: a slow push-in, slight parallax, lighting flashes that react to game events, and a subtle tint and shake per state. Images are served as WebP, ≤ 150 KB each, and lazy-loaded. `prefers-reduced-motion` shows them static.
  - **Later:** short image-to-video loops (breathing, blinking, speaking) made with Higgsfield or Runway, behind the same portrait-state interface. These are portrait loops, not cutscenes.
  - Both portraits are visible in battle: player's captain by the Ocean Grid, AI's captain by the Target Grid.

### 1A.6 Balance test (measured, not guessed)
- A headless script plays Medium-AI vs Medium-AI games for all 16 captain pairings, ≥ 1,000 games each, with fixed seeds, alternating first player.
- Reports each captain's win rate overall and when moving first vs second, plus average game length per pairing.
- **Target:** every captain wins 45–55% against the field. If one falls outside, tune a single parameter (e.g. Powder Keg to 4 cells, Crow's Nest area size, Broadside to 2 shots) and rerun. Record final numbers in the README for the debrief.
- **Result (2026-09-26, `npm run balance`, 16,000 games; full tables in `docs/balance-results.md`):**
  - First run: Broadside 52.2%, Powder Keg 54.6%, Crow's Nest 48.7%, **Ghost Ship 44.5% (out of band)**.
  - Four fixes were measured on identical seeds:
    - AI waits for 2 hits: Ghost 45.7%.
    - AI waits until one hit from sinking: 44.5% (no gain).
    - Ghost Ship repairs 1 hit: 46.6%.
    - Both combined: **47.9%**.
  - Chosen: the combined fix, which is a rule change (repair 1 hit) plus an AI timing change (2 hits). Final: Broadside 51.4%, Powder Keg 53.4%, Crow's Nest 47.3%, Ghost Ship 47.9% (49.6% moving first, 46.1% second). All four are in band, and the spread narrows from 10.1 to 6.1 points.
  - Baseline for reference: in classic Medium vs Medium the first player wins 51.9%, and a game averages 88 total shots.

## 1B. Pirate Theme (applies to every mode)

Decided 2026-09-26: **everything is pirate themed**, in Classic and Gambit modes alike. Rules, board size and ship lengths are unchanged; only presentation changes.
- **Ship display names:** Man-o'-War (5), Galleon (4), Frigate (3), Brigantine (3), Sloop (2). The engine keeps the Hasbro IDs; the UI maps them. The rule "name the ship on every hit" uses the pirate name ("Hit. Frigate.").
- **Copy:** pirate voice everywhere, readable first, flavour second. Examples: Start → "Set Sail"; Fire → "Fire the cannons!"; miss → "Splash! Nothing but brine."; hit → "Direct hit! Their Frigate takes a ball!"; sink → "Ye sank me Galleon!"; win → "Victory! The seas be yours."; loss → "Down to Davy Jones' locker..."; Rematch → "Another voyage".
- **Visuals:** the battle is a real-time 3D ocean scene (see 1C). HUD panels use wood, rope and brass frames with a compass rose; the 2D tactical grids read as parchment sea charts. Hit = fire and smoke on the ship plus a red X on the chart; miss = white splash column plus a white ring on the chart (still distinguishable without colour). Difficulty names: Easy = "Deckhand", Medium = "Buccaneer".
- **Ship styles (one distinct silhouette per length):** Man-o'-War (5): three masts, two gun decks, high stern castle. Galleon (4): three masts, square sails, ornate stern. Frigate (3): sleek three-master with a single gun deck. Brigantine (3): two masts, square-rigged fore and fore-and-aft main, so it can't be confused with the Frigate. Sloop (2): single mast, gaff sail, low hull. Every ship flies its captain's flag.
- **Audio:** pirate-themed music on the home screen and a separate battle track during the match (see 1C.5), plus cannon, splash, creaking wood and wave SFX. Separate music and SFX volume sliders, with a mute toggle.
- **Accessibility and clarity win over theme:** ARIA labels and the move log use plain coordinates alongside flavour text (e.g. "B7: hit, Frigate").

## 1C. Presentation & Experience: 3D RTS pirate battle (v0.1 baseline, iterated later)

Decided 2026-09-26. **North star:** a AAA-feeling pirate naval battle in the browser. The camera, HUD and menus take their feel from **StarCraft / Warcraft** (overhead RTS camera, framed talking-head portraits, beveled command panels, a cinematic main menu). The ocean, ships and effects aim at **Unreal-level realism** as the long-term target. The game stays turn-based Battleship with no RPG systems (no levels, loot, inventory or stats progression). The theme is all pirate, with original assets only and nothing taken from Blizzard. v0.1 establishes the pipeline and a strong baseline; fidelity grows over later iterations.

### 1C.1 Screen flow
1. **No intro video and no cutscenes** (decision 28). The game opens straight on the main menu.
2. **Main menu: storm at sea.**
   - **Backdrop:** a live 3D **stormy night ocean**, following the user's reference video (a thunderstorm over the ocean with rain and lightning). Heavy dark swells, forked lightning with thunder, driving rain, and a low camera riding the swell.
   - **Captains:** two photoreal captains fill the **left and right edges** as close crops on their faces, dissolving into the storm. Captain Ghost is on the left and Captain Crow on the right. They're lit by each lightning flash, with a slow push-in and slight mouse parallax.
   - **Centre:** the title "PIRATE BATTLESHIP" / "THE DROWNED STRAIT", and a vertical stack of weathered iron-and-brass buttons: **Set Sail**, **Settings** (graphics quality, music/SFX volume, reduced motion), **Credits**.
   - **Audio:** storm ambience (rain, waves, thunder synced to the lightning) plus the home theme.
   - **Safety:** lightning never flashes more than 3 times per second (WCAG 2.3.1), and is dimmed under reduced motion.
3. **Choose mode & difficulty:** two large mode cards, **Standard** (classic Hasbro, §1) and **Gambit** (Captain's Gambit, §1A), plus difficulty Deckhand / Buccaneer. The last choice is remembered in localStorage.
4. **Choose your captain** (**both modes**): 4 captain cards with an animated portrait, flag, bio and (in Gambit mode) the Gambit. In Standard mode the captain is cosmetic only (portrait, flag, voice lines) and grants no power. **Hero shot on selection:** the chosen card eases forward and scales up (~600 ms) with parallax between portrait layers and a slight blur and dim on the other cards (a rack-focus effect), and the captain speaks their select line. CSS transforms and filters only, with no 3D cost. Reduced motion swaps this for an instant highlight.
5. **Placement:** the RTS camera looks down on your waters. **The board is the 3D ocean itself** (decision 29): a subtle 10×10 grid of rope and buoy markers floats on the swell, and you place ships directly on the water. Pick a ship, hover a cell to see a ghost hull (valid and invalid preview), R or a button to rotate, Randomize. A small 2D chart in the corner mirrors the grid and is fully usable by keyboard; it's the accessibility path and the fallback without WebGL2.
6. **Battle:** one continuous 3D ocean, and **you aim and fire by clicking the water** (a hover reticle on the cell). The 2D charts shrink to a corner tactical map (think RTS minimap). Your fleet sits in the near waters, and the enemy waters on the far side are under **fog of war** (enemy ships are never rendered until hit or sunk, and their positions never reach the scene unless the engine reports them). Firing plays a cannon volley, a projectile arc, and then a splash or impact. Hits set fire and smoke, and sinks play a listing-and-sinking animation. The HUD shows both captain portraits (StarCraft-style frames), the move log, fleet status, the Gambit button (Gambit mode), and a 2D tactical chart for each grid (think RTS minimap) that also takes clicks and keyboard input.
7. **Game over:** a cinematic camera sweep to the winning flagship (an in-game camera move, not a video), stats, the enemy fleet revealed, and Rematch ("Another voyage") / Main menu.

### 1C.2 Camera (RTS)
- Perspective camera at about 50–60° pitch, looking over the battle like an RTS overview. Pan with WASD, the arrow keys (when the chart isn't focused), edge-scroll or a right-drag. Mouse wheel zooms between clamped limits. Q/E rotate in 45° steps. Space recenters.
- **Zero-input default:** the game must read correctly with no camera input at all (the panel may never touch the controls). The default framing shows both waters, and the director layer below carries every key moment. Free-cam is an extra, not a requirement.
- **Presets:** T toggles between **Tactical** (near top-down, both grids fully in view) and **Cinematic** (low 35° angle over your fleet), with an on-screen toggle button too. Recenter returns to the current preset.
- **Collision:** the camera never goes below a minimum height above the highest wave crest, and zoom-in is shortened by a raycast against simplified hull boxes, so it never clips through water or a ship.
- Camera motion is eased (damped). Reduced motion turns off shake and all director moves below.
- **Director layer:** the camera takes over briefly at key moments, then hands control back. Moves are queued in the order the engine reports events, and input for the next turn stays locked until the queue finishes. Any click or key skips the current move. Setting: "Cinematic camera: On / Off" (default On).
  - **Shot follow (both sides):** when a shot resolves, a damped pan (~0.4 s) brings the impact point to screen centre and holds through the splash or impact, then eases back to the player's previous camera pose. This matters most on the AI's turn: its shots land in the player's waters, which may be off-screen. It is skipped if the impact is already inside the central 60% of the view.
  - **Kill-cam on sink:** a 2–3 s cut to a low angle near the waterline, beside the sinking ship. The ship lists, goes under and leaves debris and a smoke column; the sink announcement plays; then the camera returns to the RTS overview. It plays for sinks on both sides. For an enemy ship, the model only appears because the engine has already revealed that sunk ship (1C.4), so no hidden information leaks. If a sink ends the game, the kill-cam flows into the Game Over sweep.
  - **Hit taken:** a camera shake that is added on top of the eased camera motion, never replacing it. Its size falls off with distance from the camera to the impact (full at ≤ 20 units, zero at ≥ 80) and it decays over ~150 ms; a sink uses 1.5× that size. Then the shot follow.
- The shot-follow and kill-cam beats extend the visible length of a turn but not the engine turn. The target is ≤ 3 s per turn including cinematics, so a 50-shot game doesn't drag.

### 1C.3 Rendering targets (three.js)
- **Ocean:** animated Gerstner (sum of directional waves) displacement in a custom shader, with Fresnel reflection of the sky, subsurface tint, foam on wave crests and around hulls, and a specular sun glint. Ships ride the swell: hull pitch, roll and heave are sampled from the same wave function on the CPU, so boats and water never disagree. The later upgrade path is FFT ocean and screen-space reflections.
- **Sky and lighting:** a physically based sky (three `Sky`), with the sun direction driving the directional light, PMREM environment lighting for PBR materials, ACES filmic tone mapping, and sRGB output. A soft shadow map covers the ships.
- **Ships:** v0.1 builds all five styles procedurally from three.js geometry with PBR materials (wood, canvas, brass), because the procedural approach needs no asset pipeline and loads instantly. Sails and flags move with a vertex-shader wind flutter. There is a documented upgrade path to glTF models (original or licensed, Draco/KTX2 compressed) behind the same `ShipModel` interface.
- **Effects:** cannon muzzle flash plus a smoke puff, a projectile arc, a splash column, fire and smoke on hits (GPU particles), and a sink animation. Post-processing adds bloom (subtle), vignette and FXAA/SMAA.
- **Hit-stop:** on a hit or sink, the scene's animation clock freezes for ~60 ms (about 3–4 frames at 60 fps) at the moment of impact, then the explosion and smoke play. Music and the UI are not paused. It is disabled under reduced motion.
- **Wreckage persistence:** a sunk ship doesn't disappear. Its mesh settles as a low-detail wreck (broken mast stub, floating debris, a thin smoke wisp) on its cells and stays for the rest of the match, so the ocean itself becomes a readable scoreboard. Enemy wrecks exist only because the engine revealed the sunk ship. Wrecks are cleared on Rematch.
- **Quality tiers:** Low / Medium / High, auto-detected from the device and a first-second frame-time probe, and changeable in Settings. They trade off wave count, shadow resolution, pixel ratio, particles and post-processing. Target is 60 fps on a recent laptop at High and ≥ 30 fps on a mid-range phone at Low.
- **Fallback:** if WebGL2 is unavailable, the game runs entirely on the 2D chart UI, so it stays fully playable.

### 1C.4 Architecture boundaries
- `src/engine` and `src/ai` are unchanged: pure logic, no DOM, no three.js.
- `src/scene` (three.js) **renders state only**. It receives engine events (`shot`, `hit`, `sunk`, `gambit`, `gameOver`) and animates them. It never decides a rule, and it never receives the AI fleet before game over.
- `src/ui` holds the DOM screens, HUD and 2D charts. `src/audio` holds music and SFX. Input from the 3D scene (a cell picked by raycasting onto the grid plane) and input from the 2D chart go through the same UI command path into the engine.
- Scene code is lazy-loaded after the menu's first paint, so the menu becomes interactive fast.

### 1C.5 Music and sound
- **Two looping tracks:** a home-screen theme (a stately shanty feel) and a battle theme (more percussion, more tension), crossfaded on screen changes. v0.1 generates both **procedurally with the Web Audio API** (sequenced shanty-style melodies over drones and percussion). That avoids licensing risk and adds no download weight. They can later be replaced by commissioned or properly licensed tracks through the same `MusicPlayer` interface, with any licence recorded in Credits.
- Browser autoplay rules: audio starts on the first user gesture (the first click or key press on the menu). The volume setting is persisted in localStorage.
- SFX: cannon, splash, impact, creak and a wave ambience bed, also synthesized in v0.1.
- **Ducking:** while a captain voice line or Gambit announcement is showing, music drops 6 dB and SFX 3 dB, fading down over 100 ms and back up over 400 ms.
- **Haptics:** on touch devices that support `navigator.vibrate`: hit taken = 40 ms, own ship sunk = a [60, 40, 120] ms pattern. Off under reduced motion and when SFX are muted.

### 1C.6 Video: none
- There's no intro film and there are no cutscenes (decision 28, which replaces decision 21). Everything the player sees is the live three.js scene plus the HUD.
- The only planned use of Higgsfield or Runway is short captain **portrait loops** (1A.5, later).

### 1C.7 Out of scope for v0.1
RPG systems; real-time ship movement or combat; multiplayer; FFT ocean; glTF ship assets; voice-acted lines (text voice lines only).

### 1C.8 World and art direction
- **Setting: The Drowned Strait.** A narrow, storm-prone channel littered with the wrecks of past fleets, where four rival captains fight for control. It appears as the main-menu subtitle, in the loading lines, in Credits, and in the Game Over copy ("The Strait is yours.").
- **Loading lines:** while the lazy-loaded 3D code downloads (1C.4), a rotating line of lore or pirate code shows instead of a bare spinner, e.g. "The Code: never strike your colours before the last cannon speaks." Keep a pool of about 12 lines in the pirate copy file (1B) and show each for at least 2.5 s.
- **HUD in the world's voice:** the fleet-status panel is framed as the captain's **Manifest**, and the move log as the **Ship's Log** ("Turn 14 — B7: hit, Frigate. Holed below the waterline."). Plain coordinates always come first, for accessibility (1B).
- **Colour palette** (shared by the procedural ships, HUD chrome and lighting, so separate build sessions don't drift apart):

| Role | Colour | Hex |
|------|--------|-----|
| Parchment (charts, panels) | aged tan | `#d8c39a` |
| Brass (frames, trim, buttons) | aged brass | `#b08d57` |
| Timber (hulls, frames) | dark oak | `#4a3322` |
| Water (deep / surface) | deep teal | `#0b3440` / `#1f6f78` |
| Accent (sunset, fire, hit) | blood orange | `#e0582a` |
| Fog of war / night | storm slate | `#1c2430` |

- **Lighting mood:** the default is late-afternoon dusk (warm key light from low sun, cool fill from the sky). Your own waters are lit a little warmer and brighter; enemy waters sit under cooler, denser fog, so "ours vs. unknown" reads at a glance.

### 1C.9 Roadmap: parked for the debrief (not v0.1)
Considered and deliberately deferred to protect the deadline. None of them touch the engine or rules; they are all presentation work.
- **Weather that tracks tension:** calm dusk at the start, building cloud and whitecaps as ships sink, a squall for the final exchange (driven by the Gerstner and Sky parameters).
- **Difficulty as lighting:** Deckhand = calm turquoise sea and high sun; Buccaneer = overcast sky and choppier water.
- **Lighting extras:** rim light on your own ships against the fog; god rays on the main menu; dawn / dusk / storm sky presets rotated per session.
- **Ambient life:** gulls over wrecks, a coastline silhouette, ships crossing the horizon on the menu.
- **Adaptive music:** percussion stingers on hit/sink layered into the battle track.
- **Rivalry banter:** AI captain lines chosen by score state (taunting when ahead, defiant when down to its last ship).
- **Post-match highlight:** a camera-only replay of the winning shot on Game Over.
- **Cosmetic meta:** unlockable flags and ship paint. This is the "live-service pirate battler without touching the rules engine" story.
- **A standalone art-direction document** (1C.8 is the v0.1 version).

## 2. The Orchestrator

Role: Program Manager + Tech Lead. Owns scope, sequencing, the decision log, the risk register, and the definition of done. Resolves conflicts between roles. In a vibe-coding build, the Orchestrator is **me**, and the specialist roles are hats I (and my AI agents) wear in sequence.

### 2.1 Five gating questions (answered before anything else)

| # | Question | Why it gates | Default recommendation |
|---|----------|--------------|------------------------|
| G1 | Who is the audience? | Drives polish vs speed | Interview panel: engineers judging code quality, debugging rigor, and UX polish |
| G2 | What mode? | Drives whole architecture | Human vs AI only, single-player, online (hosted URL) |
| G3 | What platform? | Drives stack | Web browser, responsive (desktop + mobile) |
| G4 | MVP vs later? | Prevents scope creep | MVP = classic rules, vs AI, 2 difficulties; later = 3rd difficulty, stats, sound |
| G5 | Constraints? | Timeline, stack, cost | Due before onsite; free hosting; stack I can explain line by line |

### 2.2 Orchestrator artifacts

- **Scope statement** (one paragraph, in README)
- **Decision log:** question → answer → role → date (section 9 of this doc)
- **Dependency map:** Rules → Data model → Engine → AI → UI → Hosting → Bug doc
- **Risk register** (section 8)
- **Definition of Done** (section 7)

### 2.3 Gates (sequence)

1. **Gate 1 – Discovery:** G1–G5 answered.
2. **Gate 2 – Rules Lock:** Section 1 verified against PDF; digital-only decisions answered.
3. **Gate 3 – Architecture Lock:** Stack, client vs server authority, hosting chosen.
4. **Gate 4 – Design Lock:** Screens + interaction model wireframed.
5. **Gate 5 – MVP Definition:** DoD signed. **Build starts only after this gate.**
6. **Gate 5.5 – Vertical Slice** (mid-build, after the classic engine, Medium AI and 3D scene basics exist): one complete turn polished end to end in 3D: player fires → shot follow → hit-stop → hit fire and smoke → AI turn → sink → kill-cam → wreck → SFX, ducking and music. Breadth work (Gambit UI, all captains and portraits, remaining effects) starts only after this slice is signed off. This hedges against "everything is 80% done and nothing can be demoed."

## 3. Roles and Their Questions

### Role 1: Product Manager (why, for whom)

Functional
- Is the core loop a quick match (5–10 min)? Yes/no.
- Accounts or guest play? (Default: guest, no login; panel must be able to play instantly.)
- Is there a start screen, or drop straight into placement?
- Rematch button at end of game?
- Do we show match stats (shots, accuracy, turns) at game end?
- Do we persist anything across sessions (win/loss record in localStorage)?

Non-functional
- Who uses it at launch? (A handful of interviewers, possibly simultaneously.)
- Success metric: panel completes a full game with zero bugs and understands every decision.
- Language: English only. No compliance scope (no PII collected).

### Role 2: Game Designer (the rules)

Functional
- Confirm Section 1 matches the Hasbro PDF exactly.
- First move: who fires first?
- Placement: manual (click/drag + rotate), random, or both? (Default: both, with "Randomize" button.)
- Sink announcement: show "You sank my Cruiser!" for both sides? (Rules say yes.)
- Reveal AI fleet at game end if the human loses? (Default: yes.)
- AI difficulty levels:
  - **Easy:** random untried cell.
  - **Medium (Hunt/Target):** random (checkerboard parity) until hit, then probes adjacent cells, follows the line, and returns to hunt after a sink. Because the defender names the ship on every hit, the AI groups hits by ship name: it targets each damaged ship separately, clears only the sunk ship's hits on a sink (keeps chasing other damaged ships), and uses remaining ship lengths to bound its search.
  - **Hard (Probability density):** for every untried cell, counts how many ways each remaining ship could fit there; fires at the max. Optional for MVP.
- Does the AI cheat? (Must be **no**. AI uses only hit/miss/ship-named/sunk info, same as a human.)
- Is the "AI" machine learning? (**No.** It is a deterministic algorithm, "AI" in the video-game sense: stronger than ML here, instant, testable, cannot cheat. Debrief framing: the opponent is an algorithm; AI was used to *build* it.)

Non-functional
- AI move delay: instant, or ~400–800 ms "thinking" pause for feel?
- Target match length: ~40–70 total shots vs Medium AI.

### Role 3: UX/UI Designer (look and feel)

Functional
- Screens (1C.1): Main Menu (storm) → Mode & Difficulty (Standard / Gambit) → Choose Your Captain → Placement → Battle → Game Over (winner, stats, rematch).
- Placement interaction: click ship, click cell, "R" key / button to rotate, ghost preview showing valid (green) vs invalid (red + pattern) positions.
- Battle layout: both grids visible (desktop side by side; mobile stacked, Target Grid on top).
- Feedback: hit / miss / sunk visuals, turn indicator, message log ("AI fires at C-4: Miss").
- Fleet status panel: which of your ships and the AI's ships are still afloat.

Non-functional
- Accessibility: markers distinguishable without color (X for hit, dot for miss); keyboard play (arrow keys + Enter); ARIA labels on cells ("B7, hit"); WCAG AA contrast.
- Responsive from 360 px phone width to desktop.
- Visual style: pirate theme throughout (1B), a 3D RTS-style ocean battle (1C), and animated captain portraits (1A.5).
- 60 fps target (quality tiers, 1C.3); respects `prefers-reduced-motion`; 2D chart fallback without WebGL2.

### Role 4: Backend / Systems Engineer (engine, authority, scale)

Functional
- **Where does the game logic live?** This is the key architecture question (see 4.1).
- Game state model: board, ships, shots, turn, status, winner.
- Engine API (pure functions, no UI):
  - `placeShip(board, ship, row, col, orientation)` → valid / error reason
  - `randomPlacement()` → valid fleet
  - `fire(state, row, col)` → `{ result: hit|miss|sunk, shipName?, gameOver, winner? }`
  - `aiChooseShot(knowledge, difficulty)` → `{ row, col }`
- Reject illegal actions: out of bounds, repeat shot, firing out of turn, firing after game over.
- Idempotency: a double-click or retried request must never count as two shots (move sequence number).

Non-functional (right-sized scale math)
- Expected load: a panel of ~3–10 players; design for 1,000 concurrent games to show headroom.
- State per game: 2 x 100 cells + 5 ships + ≤ 200 shots ≈ < 5 KB. 1,000 games ≈ 5 MB RAM. Storage is a non-issue.
- Throughput: human fires ~1 shot / 3 s; 1,000 games ≈ 330 req/s peak. A single small instance handles this.
- Consistency: each game is self-contained (partition key = `gameId`), so turn order and hit resolution are strongly consistent within a game without distributed locking. Same insight as sharding the parking garage by `garage_id`.
- Latency: turn-based, so < 200 ms response is plenty.

### Role 5: Frontend / Client Engineer

Functional
- Framework: vanilla TS for the DOM UI; **three.js** for the 3D scene (1C).
- Render grids from state; never hold game truth in the DOM.
- Disable input while waiting for AI / server response.
- Handle refresh mid-game: resume or restart? (Default MVP: restart; stretch: resume from localStorage/server.)

Non-functional
- Menu interactive < 2 s on 4G (menu shell ≤ 60 KB gz); 3D scene chunk (three.js + scene code) ≤ 250 KB gz, lazy-loaded.
- Browsers: latest Chrome, Safari (incl. iOS), Firefox, Edge.
- No console errors or warnings in production.

### Role 6: QA, Security & DevOps

Functional test cases (minimum)
- Placement: overlap rejected, off-board rejected, diagonal impossible, all 5 ships required before start, random placement always valid (property test, 10,000 runs).
- Firing: hit, miss, sink detection, repeat-shot rejected, out-of-turn rejected, fire after game over rejected.
- Win: last cell of last ship ends game for both human and AI paths.
- AI: never fires the same cell twice; never fires off-board; Medium finishes a ship once found; AI never reads human ship positions.
- UI: rapid double-click = one shot; rotate at board edge; resize mid-game; keyboard-only full game.

Non-functional
- Security: if server-authoritative, the AI fleet is never sent to the client until game over. Input validation on every request. Rate limit per session.
- Hosting: free tier, HTTPS, custom-free URL (e.g. GitHub Pages / Vercel / Render).
- CI: GitHub Actions runs tests + lint on every push.
- Monitoring (lightweight): client error logging to console + a health endpoint if a server exists.
- Uptime: must be up during the review window; no cold-start that hangs > 5 s in front of the panel.

## 4. Key Architecture Decisions (for Gate 3)

### 4.1 Client-only vs server-authoritative

The prompt says "play **online** against an AI". Both options satisfy that; the trade-off is the thing to discuss in the debrief.

| | A. Static client-only | B. Thin server-authoritative |
|---|---|---|
| How | All logic in browser; host on Vercel (static) | Engine + AI on a small API (Node or Python); client renders only |
| Hidden info | AI fleet visible in dev tools (cheatable) | AI fleet never leaves server until game over |
| Hosting | Free, instant, no cold start | Vercel Functions in the same project (`/api`); stateless, so state lives in an encrypted game token round-tripped by the client, or in a KV store (Upstash Redis) |
| Complexity | Low | Medium (API, state store, CORS, sessions) |
| Interview signal | Clean, fast, well-tested | Shows system design thinking from the prep (authority, consistency, idempotency) |

**Recommendation:** Write the engine as a **pure, UI-free module** with full unit tests. Ship **A** for MVP (reliable link, zero cold starts), and document **B** as the production design in the README/debrief. If time allows, move the engine behind an API (B) without rewriting it. This keeps the demo link bulletproof while still showing you understand the hidden-information problem.

### 4.2 Stack (decided 2026-09-26)
- Language: **TypeScript** (strict).
- Framework: **none** for UI (vanilla TS + ES modules), built with **Vite**. **three.js** (runtime dependency, approved 2026-09-26) for the 3D scene, using its bundled `examples/jsm` addons (Sky, post-processing); no other engine.
- Test runner: **Vitest**; lint with **ESLint**; CI on **GitHub Actions**.
- Hosting: **Vercel** (Git-connected, auto-deploy on push to `main`, preview URL per branch). Chosen over GitHub Pages for zero-config Vite deploys, preview URLs, and a same-project path to server authority via Vercel Functions. Next.js rejected as unnecessary for a single-page game.
- Local tooling: Node.js LTS, GitHub CLI (`gh`), a code editor, Devin.

## 5. Functional Requirements (consolidated)

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Start a new game vs AI and choose difficulty | Must |
| F2 | Place 5 classic ships manually (with rotate) or randomly | Must |
| F3 | Validate placement: in bounds, no overlap, horizontal/vertical only | Must |
| F4 | AI places its fleet randomly and legally | Must |
| F5 | Alternate turns, one shot per turn | Must |
| F6 | Report hit / miss for every shot, both sides | Must |
| F7 | Announce which ship is sunk, both sides | Must |
| F8 | Detect win when all 5 ships are sunk; show winner | Must |
| F9 | Block repeat shots and out-of-turn shots | Must |
| F10 | Easy and Medium AI | Must |
| F11 | Fleet status panel for both sides | Should |
| F12 | Move log | Should |
| F13 | Rematch / new game | Must |
| F14 | Reveal AI fleet at game over | Should |
| F15 | End-of-game stats (shots, accuracy) | Could |
| F16 | Hard (probability) AI | Could |
| F17 | Resume after refresh | Could |
| F18 | Adaptive Hard: weight Hard's probability map by this player's past ship placements (per-cell counts in localStorage; a Bayesian prior, no ML model) | Could |
| F19 | Pirate theme across all screens, copy, and ship display names (1B) | Must |
| F20 | Captain's Gambit toggle, default Off; Off = pure classic (1A.1) | Must |
| F21 | Choose Your Captain screen: 4 captains, each with one once-per-game Gambit (1A.3) | Must |
| F22 | Gambits: Broadside, Powder Keg (open water only), Crow's Nest, Ghost Ship, enforced by the engine (1A.2–1A.3) | Must |
| F23 | AI picks a captain and uses its Gambit by rule (1A.4) | Must |
| F24 | Animated captain portraits: idle loop + reaction states (1A.5) | Must (idle), Should (all reaction states) |
| F25 | Captain voice lines (text) and pirate sound effects | Should |
| F26 | 3D ocean battle scene: Gerstner waves, sky, PBR lighting, ships riding the swell (1C.3) | Must |
| F27 | Five distinct procedural pirate ship styles, one per length (1B, 1C.3) | Must |
| F28 | RTS camera: pan, zoom, rotate, recenter (1C.2) | Must |
| F29 | Screen flow: storm main menu with two photoreal captains, mode & difficulty, captain select in both modes (1C.1) | Must |
| F30 | Home and battle music, procedural Web Audio, with volume/mute (1C.5) | Must |
| F31 | Combat effects: cannon, projectile, splash, fire/smoke, sinking (1C.3) | Must (splash, hit), Should (full set) |
| F32 | Quality tiers + 2D chart fallback without WebGL2 (1C.3) | Must |
| F33 | ~~Intro video and cutscenes~~ | Dropped (decision 28) |
| F34 | Camera director: shot follow (both sides), kill-cam on sink, skippable, "Cinematic camera" setting (1C.2) | Must (shot follow), Should (kill-cam) |
| F35 | Captain-select hero shot (1C.1) | Should |
| F36 | Camera presets Tactical/Cinematic (T), camera collision, zero-input default framing (1C.2) | Must |
| F37 | Game feel: hit-stop, distance-scaled additive shake, wreckage persistence (1C.2–1C.3) | Must |
| F38 | Audio ducking under voice lines/announcements; mobile haptics (1C.5) | Should |
| F40 | 3D board: place and fire directly on the ocean; the 2D chart becomes a corner tactical map and the accessibility/fallback path (1C.1) | Must |
| F41 | Photoreal captain portraits with state reactions (1A.5) | Must (idle + lightning/hit reactions), Should (all states) |
| F39 | World: The Drowned Strait setting, loading lines, Manifest / Ship's Log HUD, palette (1C.8) | Must (setting, palette, log framing), Should (loading lines) |

## 6. Non-Functional Requirements (consolidated)

| ID | Category | Target |
|----|----------|--------|
| N1 | Availability | Public HTTPS URL up throughout review; no login |
| N2 | Performance | Menu interactive < 2 s; each action < 100 ms locally; AI move ≤ 1 s incl. delay (animations may extend the visible turn); portraits ≤ 40 KB each; 60 fps at High on a recent laptop, ≥ 30 fps at Low on a mid-range phone; scene chunk ≤ 250 KB gz |
| N3 | Correctness | Engine unit-test coverage ≥ 90%; all Section 3 Role 6 cases pass |
| N4 | Consistency | Single source of truth for state; UI derived from state; no double shots |
| N5 | Security / fairness | AI never uses hidden info; server mode never leaks AI fleet |
| N6 | Accessibility | Non-color markers, keyboard play, ARIA labels, AA contrast |
| N7 | Compatibility | Latest Chrome, Safari (desktop + iOS), Firefox, Edge; 360 px+ widths |
| N8 | Maintainability | Engine / AI / UI separated; readable code; README explains architecture |
| N9 | Observability | Zero console errors; bug doc documents every defect found |
| N10 | Scalability (design) | Per-game isolation; documented path to server-authoritative scaling |
| N11 | Delivery | CI runs tests on each push; repo public; clean commit history |

### 6.1 Stretch / Debrief-Only Variants (NOT implemented)

These are **talking points for the debrief only**. They were considered and deliberately excluded to avoid scope creep (see the "Scope creep" row in the Risk Register). Beyond classic Hasbro rules, the only extension in v0.1 is Captain's Gambit mode (1A), which replaced the earlier "one-time Super Shot" idea.

Optionality design: every variant is a named flag on a single rules config (e.g. `rules.variants.salvo`), **all defaulting to Off**. The MVP builds no variant logic; it only keeps rules in one config object so a variant could be switched on later without rewriting the engine. The toggles on this planning page record the scope decision for each variant (Off = excluded); switching one On means it must be added to the Decision Log and re-approved at Gate 5 before any work starts.

| Flag | Variant | Source | What changes | Default |
|------|---------|--------|--------------|---------|
| `salvo` | Salvo | Official Hasbro variation (PDF p.3) | Each turn fire 5 shots; lose one shot per ship of yours that is sunk; results announced after the full salvo | Off |
| `salvoHiddenHits` | Salvo: undisclosed hits | Official Hasbro sub-variant (PDF p.3) | With Salvo on, the defender doesn't disclose which ships were hit | Off |
| `hotColdHints` | Hot/Cold hints | House rule | A miss also reports whether a ship is adjacent ("warm") | Off |
| `fogRevealOnSink` | Fog-of-war reveal on sink | House rule | When a ship is sunk, its full outline is revealed on the shooter's Target Grid | Off |

Debrief angle: each flag changes the AI too (Salvo breaks one-shot hunt/target logic; hints and reveals change the probability model), which is part of why they stay out of scope.

## 7. Definition of Done (MVP)

- [ ] All "Must" functional requirements (Section 5) work end to end.
- [ ] All non-functional targets N1–N9, N11 met.
- [ ] Engine and AI tests pass in CI.
- [ ] Full game played to completion on desktop and a phone, both win and loss.
- [ ] `docs/BUGS.md` lists every bug found with root cause and fix.
- [ ] Public repo with README (overview, how to play, how to run, architecture, trade-offs).
- [ ] Live URL tested in an incognito window.
- [ ] Classic mode (Gambit Off) passes every classic test unchanged.
- [ ] Each of the 4 Gambits tested in the engine (legal, illegal, once-only), and a full Gambit-mode game played with each captain.
- [ ] Balance test (1A.6) run; every captain within 45–55% win rate; numbers in README.
- [ ] Captain names, flags and portraits are original (no copyrighted characters or assets).
- [ ] Vertical slice (Gate 5.5) signed off before breadth work.
- [ ] **Human feel pass:** at least one full game played by someone other than the builder, **without being taught the camera controls**, on desktop and phone. Camera, lighting, audio and pacing (≤ 3 s per turn) are signed off, and their notes are recorded in the README. Automated tests can't catch "the pan feels sluggish."

## 8. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Hosting cold start / outage during review | High | Med | Static hosting for MVP; test URL day-of |
| Scope creep (extra modes, animations) | High | High | Hasbro rules only; MoSCoW table above |
| AI cheats or looks dumb | Med | Med | AI only uses shot results; test Medium hunt/target behavior |
| Subtle rule bugs (sink detection, repeat shots) | High | Med | Engine TDD before UI |
| Mobile layout broken | Med | Med | Test at 360 px early |
| Captain's Gambit + portraits push v0.1 past the deadline | High | Med | Build order: classic engine → Gambit engine → AI → UI → theme → portraits; classic stays shippable at every step; portraits start as static SVG, animation added last |
| Gambits break classic rules or each other | High | Med | `rules.gambit` flag; classic suite must pass with Gambit Off; engine tests per Gambit incl. edge cases (edge-clipped blast, Ghost Ship onto fired cells, Broadside winning mid-volley) |
| Portrait art looks like copied IP | Med | Low | Original SVG art "in the spirit of" RTS portraits; naming brief bans existing characters |
| Theme hurts readability/accessibility | Med | Med | Plain coordinates in ARIA labels and move log; non-colour markers kept |
| 3D scene scope ("AAA/Unreal") swamps the deadline | High | High | Rules first: engine + AI + 2D chart UI playable before 3D polish; 3D scene renders state only; fidelity is iterative (v0.1 baseline, later glTF/FFT); quality tiers |
| 3D performance on phones / no WebGL2 | High | Med | Auto quality tiers, frame-time probe, 2D chart fallback |
| Scene leaks hidden info (enemy ships rendered or in memory) | High | Low | Scene only gets what the engine reveals; enemy ships spawned on hit/sink/game over only |
| Interview panel never explores the camera controls and judges only the default view, so the 3D polish goes unseen | High | High | Zero-input default framing plus the camera director (1C.2) carry every key moment; the director is built before free-cam polish; Tactical/Cinematic presets on one key; the feel pass is done by someone who isn't shown the controls |
| Visual drift across build sessions (ships, HUD, lighting don't match) | Med | Med | One palette and lighting mood in 1C.8; every visual step references it |
| Music/asset licensing | Med | Low | v0.1 audio procedural; any future track or model licence recorded in Credits |
| Can't explain AI-generated code | High | Med | Review every diff; keep stack simple |
| Bug doc thin | Med | Med | Log bugs as they're found, not at the end |

## 9. Decision Log (fill in)

| # | Question | Decision | Role | Date |
|---|----------|----------|------|------|
| 1 | Audience | Interview panel (engineers) judging correctness, debugging rigor, UX polish | Orchestrator | 2026-09-26 |
| 2 | Mode | Human vs AI, single-player, online (hosted URL) | Orchestrator | 2026-09-26 |
| 3 | Platform | Web browser, responsive (desktop + mobile) | Orchestrator | 2026-09-26 |
| 4 | MVP scope | v0.1 = all "Must" requirements (incl. pirate theme and Captain's Gambit), Easy + Medium AI; Hard (F16) and Adaptive Hard (F18) later | Orchestrator | 2026-09-26 |
| 5 | Constraints | Due before onsite; free hosting; stack explainable line by line | Orchestrator | 2026-09-26 |
| 6 | Who fires first | Human fires first in the first game; alternates on every Rematch | Game Designer | 2026-09-26 |
| 7 | Placement modes | Manual (click + rotate) and Randomize | Game Designer | 2026-09-26 |
| 8 | AI difficulties in MVP | Easy (random) + Medium (hunt/target, hits grouped by ship name) | Game Designer | 2026-09-26 |
| 9 | Client-only vs server-authoritative | Client-only for v0.1; server-authoritative (Vercel Functions) documented as production design | Systems Engineer | 2026-09-26 |
| 10 | Language / framework | TypeScript + Vite, no UI framework | Frontend Engineer | 2026-09-26 |
| 11 | Hosting | Vercel | DevOps | 2026-09-26 |
| 12 | Test runner / CI | Vitest + ESLint, GitHub Actions | QA | 2026-09-26 |
| 13 | Captain's Gambit mode | In v0.1, behind a toggle, default Off (1A) | Orchestrator | 2026-09-26 |
| 14 | AI gets a captain | Yes, random captain, rule-based Gambit use (1A.4) | Game Designer | 2026-09-26 |
| 15 | Theme | Pirate theme everywhere; pirate ship display names (1B) | UX Designer | 2026-09-26 |
| 16 | Captain names | Chosen by Devin during the build per naming brief (1A.5) | Game Designer | |
| 17 | Gambit board size | 10x10, same as Classic (12x12 rejected, see 1A.1) | Game Designer | 2026-09-26 |
| 18 | Presentation | 3D RTS-style pirate ocean battle in three.js; StarCraft/Warcraft feel, Unreal-level realism as the target; no RPG systems (1C) | Orchestrator | 2026-09-26 |
| 19 | Modes | "Standard" (classic) and "Gambit"; captain select in both, powers only in Gambit | Game Designer | 2026-09-26 |
| 20 | Music | Home + battle themes, procedural Web Audio in v0.1; licensed/commissioned later | UX Designer | 2026-09-26 |
| 21 | Video | Intro + cutscenes via Higgsfield/Runway later; skippable plumbing only in v0.1 | Orchestrator | 2026-09-26 |
| 22 | Design review (§1C) | Folded in: camera director, presets, collision, hit-stop, shake curve, wreckage, setting "The Drowned Strait", loading lines, Manifest / Ship's Log, palette, ducking, haptics, Gate 5.5, feel pass in DoD, "panel never explores controls" risk. Parked: 1C.9 | Orchestrator | 2026-09-26 |
| 23 | Powder Keg vs a Ghost-Shipped ship | Old hits on a relocated ship still block Powder Keg until that ship is sunk (conservative; tested) | Game Designer | 2026-09-26 |
| 24 | Hardest AI in v0.1 | Two levels as planned (Deckhand, Buccaneer); Hard stays post-deploy | Orchestrator | 2026-09-26 |
| 25 | AI captain in Standard mode | Random captain, different from the player's, cosmetic only (portrait, flag, banter) | Game Designer | 2026-09-26 |
| 26 | Ghost Ship balance fix | Ghost Ship repairs 1 hit; the AI uses it at 2 hits (Sloop: 1). Ghost 44.5% → 47.9% (1A.6) | Game Designer | 2026-09-26 |
| 27 | Powder Keg vs a Ghost-Shipped ship (reconsidered; replaces 23) | Old hits on a relocated ship **no longer** block Powder Keg; hits on the ship at its new position do. Reason: the ship is announced as escaped, the Medium AI already treats it as unfound, and the restriction exists to stop finishing a *located* ship. Balance re-run after the change | Game Designer | 2026-09-26 |
| 28 | Intro video and cutscenes | **Dropped** (replaces 21). The game opens on the menu; no pre-rendered video anywhere. Higgsfield/Runway only for later portrait loops | Orchestrator | 2026-09-26 |
| 29 | The board | The board is the 3D ocean itself: place ships and fire by clicking the water; the 2D chart becomes a corner tactical map plus the accessibility/fallback path | UX Designer | 2026-09-26 |
| 30 | Captain art | Photoreal, owner-supplied (rights confirmed by the owner): Ghost = skull-faced pirate, Crow = young tricorn pirate, Broadside = dreadlocks and war paint, Powder Keg = woman in skull tricorn. Replaces the SVG portraits | UX Designer | 2026-09-26 |
| 31 | Main menu concept | Live stormy-night ocean (lightning, rain, thunder) after the owner's reference video, with Captain Ghost on the left and Captain Crow on the right as close face crops, menu centred | UX Designer | 2026-09-26 |
