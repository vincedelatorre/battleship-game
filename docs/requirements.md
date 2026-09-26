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

| Ship | Length |
|------|--------|
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

- **Placement:** Each ship is placed horizontally or vertically only (never diagonally). Ships may not overlap, may not hang off the grid, and may not be moved once play begins. Ships may touch (classic rules do not forbid adjacency).
- **Turn order:** Players alternate. One shot per turn: call a coordinate (e.g. "B-7").
- **Response:** Opponent answers "miss", or "hit" **and names the ship that was hit** (e.g. "Hit. Cruiser."). Hits are marked red, misses white, on the shooter's Target Grid; the defender marks the hit on their Ocean Grid. After a hit or a miss, the turn is over.
- **Sinking:** When every cell of a ship is hit, it is sunk, and the owner must announce which ship was sunk.
- **Win:** First player to sink all 5 opposing ships wins.
- **Out of scope (explicitly):** Salvo (an official variation in the Hasbro PDF, excluded from MVP; see 6.1), extra turn on hit, power-ups, custom fleets, custom board sizes, diagonal placement.

Digital-only decisions the physical rules don't cover (must be answered at Gate 2):
- Who goes first? (PDF: "Decide who will go first." Digital: human first, coin flip, or choice?)
- Firing at an already-fired cell: blocked in UI and rejected by engine (not a wasted turn).
- Forfeit / restart mid-game: allowed? Counts as loss?

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
- Screens: Start (difficulty) → Placement → Battle → Game Over (winner, stats, rematch).
- Placement interaction: click ship, click cell, "R" key / button to rotate, ghost preview showing valid (green) vs invalid (red + pattern) positions.
- Battle layout: both grids visible (desktop side by side; mobile stacked, Target Grid on top).
- Feedback: hit / miss / sunk visuals, turn indicator, message log ("AI fires at C-4: Miss").
- Fleet status panel: which of your ships and the AI's ships are still afloat.

Non-functional
- Accessibility: markers distinguishable without color (X for hit, dot for miss); keyboard play (arrow keys + Enter); ARIA labels on cells ("B7, hit"); WCAG AA contrast.
- Responsive from 360 px phone width to desktop.
- Visual style: clean naval theme; no heavy asset downloads.
- 60 fps animations; respects `prefers-reduced-motion`.

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
- Framework: vanilla JS/TS, React, or a canvas engine? (Default: lean. See 4.1.)
- Render grids from state; never hold game truth in the DOM.
- Disable input while waiting for AI / server response.
- Handle refresh mid-game: resume or restart? (Default MVP: restart; stretch: resume from localStorage/server.)

Non-functional
- Time to playable < 2 s on 4G; bundle < 200 KB.
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
- Framework: **none** (vanilla TS + ES modules), built with **Vite**.
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

## 6. Non-Functional Requirements (consolidated)

| ID | Category | Target |
|----|----------|--------|
| N1 | Availability | Public HTTPS URL up throughout review; no login |
| N2 | Performance | Playable < 2 s; each action < 100 ms locally; AI move ≤ 1 s incl. delay |
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

These are **talking points for the debrief only**. They were considered and deliberately excluded to avoid scope creep (see the "Scope creep" row in the Risk Register). The MVP ships classic Hasbro rules only.

Optionality design: every variant is a named flag on a single rules config (e.g. `rules.variants.salvo`), **all defaulting to Off**. The MVP builds no variant logic; it only keeps rules in one config object so a variant could be switched on later without rewriting the engine. The toggles on this planning page record the scope decision for each variant (Off = excluded); switching one On means it must be added to the Decision Log and re-approved at Gate 5 before any work starts.

| Flag | Variant | Source | What changes | Default |
|------|---------|--------|--------------|---------|
| `salvo` | Salvo | Official Hasbro variation (PDF p.3) | Each turn fire 5 shots; lose one shot per ship of yours that is sunk; results announced after the full salvo | Off |
| `salvoHiddenHits` | Salvo: undisclosed hits | Official Hasbro sub-variant (PDF p.3) | With Salvo on, the defender doesn't disclose which ships were hit | Off |
| `hotColdHints` | Hot/Cold hints | House rule | A miss also reports whether a ship is adjacent ("warm") | Off |
| `fogRevealOnSink` | Fog-of-war reveal on sink | House rule | When a ship is sunk, its full outline is revealed on the shooter's Target Grid | Off |
| `superShot` | One-time Super Shot | House rule | Once per game, fire a 3x3 (or plus-shaped) blast in a single turn | Off |

Debrief angle: each flag changes the AI too (Salvo breaks one-shot hunt/target logic; hints and reveals change the probability model), which is part of why they stay out of scope.

## 7. Definition of Done (MVP)

- [ ] All "Must" functional requirements (Section 5) work end to end.
- [ ] All non-functional targets N1–N9, N11 met.
- [ ] Engine and AI tests pass in CI.
- [ ] Full game played to completion on desktop and a phone, both win and loss.
- [ ] `docs/BUGS.md` lists every bug found with root cause and fix.
- [ ] Public repo with README (overview, how to play, how to run, architecture, trade-offs).
- [ ] Live URL tested in an incognito window.

## 8. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Hosting cold start / outage during review | High | Med | Static hosting for MVP; test URL day-of |
| Scope creep (extra modes, animations) | High | High | Hasbro rules only; MoSCoW table above |
| AI cheats or looks dumb | Med | Med | AI only uses shot results; test Medium hunt/target behavior |
| Subtle rule bugs (sink detection, repeat shots) | High | Med | Engine TDD before UI |
| Mobile layout broken | Med | Med | Test at 360 px early |
| Can't explain AI-generated code | High | Med | Review every diff; keep stack simple |
| Bug doc thin | Med | Med | Log bugs as they're found, not at the end |

## 9. Decision Log (fill in)

| # | Question | Decision | Role | Date |
|---|----------|----------|------|------|
| 1 | Audience | Interview panel (engineers) judging correctness, debugging rigor, UX polish | Orchestrator | 2026-09-26 |
| 2 | Mode | Human vs AI, single-player, online (hosted URL) | Orchestrator | 2026-09-26 |
| 3 | Platform | Web browser, responsive (desktop + mobile) | Orchestrator | 2026-09-26 |
| 4 | MVP scope | v0.1 = all "Must" requirements, Easy + Medium AI; Hard (F16) and Adaptive Hard (F18) later | Orchestrator | 2026-09-26 |
| 5 | Constraints | Due before onsite; free hosting; stack explainable line by line | Orchestrator | 2026-09-26 |
| 6 | Who fires first | Human fires first (default; revisit) | Game Designer | 2026-09-26 |
| 7 | Placement modes | Manual (click + rotate) and Randomize | Game Designer | 2026-09-26 |
| 8 | AI difficulties in MVP | Easy (random) + Medium (hunt/target, hits grouped by ship name) | Game Designer | 2026-09-26 |
| 9 | Client-only vs server-authoritative | Client-only for v0.1; server-authoritative (Vercel Functions) documented as production design | Systems Engineer | 2026-09-26 |
| 10 | Language / framework | TypeScript + Vite, no UI framework | Frontend Engineer | 2026-09-26 |
| 11 | Hosting | Vercel | DevOps | 2026-09-26 |
| 12 | Test runner / CI | Vitest + ESLint, GitHub Actions | QA | 2026-09-26 |
