import { writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { playGame } from "../../src/ai/simulate";
import type { Difficulty } from "../../src/ai/shot";
import { CAPTAINS } from "../../src/engine/captains";
import type { PlayerIndex } from "../../src/engine/types";

/**
 * Requirements §1A.6 balance run: Medium vs Medium across all 16 ordered
 * captain pairings, plus a classic Medium-vs-Medium baseline.
 *
 * Seed scheme: game i of pairing p uses seed = p * 100_000 + i;
 * firstPlayer alternates by game index. Baseline seeds are
 * 2_000_000 + i. Deterministic — rerun to reproduce exactly.
 *
 * This test never fails on balance numbers; it reports them. Tuning is
 * a design decision, not a test fix.
 */

const GAMES_PER_PAIRING = 1_000;
const BASELINE_GAMES = 4_000;
const N = CAPTAINS.length; // 4
const MEDIUM: readonly [Difficulty, Difficulty] = ["medium", "medium"];

const pct = (wins: number, games: number): string =>
  games === 0 ? "  —  " : `${((100 * wins) / games).toFixed(1)}%`;

describe("captain balance simulation", () => {
  it(
    "plays all pairings and writes docs/balance-results.md",
    () => {
      // wins[a][b]: games where seat-a captain beat seat-b captain
      // (pairing (a,b) always seats a first in the array).
      const matrixWins = Array.from({ length: N }, () =>
        new Array<number>(N).fill(0),
      );
      const matrixGames = Array.from({ length: N }, () =>
        new Array<number>(N).fill(0),
      );
      const matrixShots = Array.from({ length: N }, () =>
        new Array<number>(N).fill(0),
      );
      // per-captain seat stats
      const seatWins = new Array<number>(N).fill(0);
      const seatGames = new Array<number>(N).fill(0);
      const firstWins = new Array<number>(N).fill(0);
      const firstGames = new Array<number>(N).fill(0);
      const secondWins = new Array<number>(N).fill(0);
      const secondGames = new Array<number>(N).fill(0);

      for (let a = 0; a < N; a++) {
        for (let b = 0; b < N; b++) {
          const capA = CAPTAINS[a];
          const capB = CAPTAINS[b];
          if (!capA || !capB) throw new Error("missing captain");
          const pairing = a * N + b;
          for (let i = 0; i < GAMES_PER_PAIRING; i++) {
            const firstPlayer = (i % 2) as PlayerIndex;
            const r = playGame({
              seed: pairing * 100_000 + i,
              difficulty: MEDIUM,
              firstPlayer,
              captains: [capA.id, capB.id],
            });
            const w = r.winner;
            const totalShots = r.shots[0] + r.shots[1];
            const rowW = matrixWins[a];
            const rowG = matrixGames[a];
            const rowS = matrixShots[a];
            if (!rowW || !rowG || !rowS) throw new Error("matrix");
            rowW[b] = (rowW[b] ?? 0) + (w === 0 ? 1 : 0);
            rowG[b] = (rowG[b] ?? 0) + 1;
            rowS[b] = (rowS[b] ?? 0) + totalShots;
            // per-seat stats for both captains
            for (const [seat, cap] of [
              [0, a],
              [1, b],
            ] as const) {
              seatGames[cap] = (seatGames[cap] ?? 0) + 1;
              const won = w === seat;
              if (won) seatWins[cap] = (seatWins[cap] ?? 0) + 1;
              const movedFirst = seat === firstPlayer;
              if (movedFirst) {
                firstGames[cap] = (firstGames[cap] ?? 0) + 1;
                if (won) firstWins[cap] = (firstWins[cap] ?? 0) + 1;
              } else {
                secondGames[cap] = (secondGames[cap] ?? 0) + 1;
                if (won) secondWins[cap] = (secondWins[cap] ?? 0) + 1;
              }
            }
          }
        }
      }

      // Baseline: classic medium vs medium.
      let baseFirstWins = 0;
      let baseShots = 0;
      for (let i = 0; i < BASELINE_GAMES; i++) {
        const r = playGame({
          seed: 2_000_000 + i,
          difficulty: MEDIUM,
          firstPlayer: (i % 2) as PlayerIndex,
        });
        if (r.winner === 0 || r.winner === 1) {
          if (r.winner === (i % 2)) baseFirstWins++;
        }
        baseShots += r.shots[0] + r.shots[1];
      }

      // ---- report ----
      const date = new Date().toISOString().slice(0, 10);
      const lines: string[] = [];
      lines.push(`# Captain balance results (§1A.6)`);
      lines.push(``);
      lines.push(`Generated: ${date}`);
      lines.push(``);
      lines.push(
        `Seed scheme: pairing p (row a, column b → p = a*4+b), game i uses`,
      );
      lines.push(
        `seed = p * 100000 + i, firstPlayer alternates by game index.`,
      );
      lines.push(
        `Baseline classic games use seed = 2000000 + i. ${GAMES_PER_PAIRING} games`,
      );
      lines.push(
        `per ordered pairing, ${BASELINE_GAMES} baseline games. Medium AI on both seats.`,
      );
      lines.push(``);
      lines.push(`## Overall win rate per captain (all seats)`);
      lines.push(``);
      lines.push(`| Captain | Overall | Moving first | Moving second |`);
      lines.push(`|---|---|---|---|`);
      for (let c = 0; c < N; c++) {
        const cap = CAPTAINS[c];
        if (!cap) throw new Error("missing captain");
        lines.push(
          `| ${cap.placeholderName} | ${pct(seatWins[c] ?? 0, seatGames[c] ?? 0)} | ${pct(firstWins[c] ?? 0, firstGames[c] ?? 0)} | ${pct(secondWins[c] ?? 0, secondGames[c] ?? 0)} |`,
        );
      }
      lines.push(``);
      lines.push(`## Win-rate matrix (row captain vs column captain)`);
      lines.push(``);
      lines.push(
        `| | ${CAPTAINS.map((c) => c.placeholderName).join(" | ")} |`,
      );
      lines.push(`|---|${CAPTAINS.map(() => "---").join("|")}|`);
      for (let a = 0; a < N; a++) {
        const capA = CAPTAINS[a];
        if (!capA) throw new Error("missing captain");
        const cells: string[] = [];
        for (let b = 0; b < N; b++) {
          cells.push(
            a === b ? "50.0%*" : pct(matrixWins[a]?.[b] ?? 0, matrixGames[a]?.[b] ?? 0),
          );
        }
        lines.push(`| ${capA.placeholderName} | ${cells.join(" | ")} |`);
      }
      lines.push(``);
      lines.push(`*mirror pairings contribute a fixed 50%.`);
      lines.push(``);
      lines.push(`## Average game length (total shots, both sides)`);
      lines.push(``);
      lines.push(
        `| | ${CAPTAINS.map((c) => c.placeholderName).join(" | ")} |`,
      );
      lines.push(`|---|${CAPTAINS.map(() => "---").join("|")}|`);
      for (let a = 0; a < N; a++) {
        const capA = CAPTAINS[a];
        if (!capA) throw new Error("missing captain");
        const cells: string[] = [];
        for (let b = 0; b < N; b++) {
          const g = matrixGames[a]?.[b] ?? 0;
          cells.push(g === 0 ? "—" : ((matrixShots[a]?.[b] ?? 0) / g).toFixed(1));
        }
        lines.push(`| ${capA.placeholderName} | ${cells.join(" | ")} |`);
      }
      lines.push(``);
      lines.push(`## Baseline: classic Medium vs Medium`);
      lines.push(``);
      lines.push(`| Games | First-player win rate | Avg length (shots) |`);
      lines.push(`|---|---|---|`);
      lines.push(
        `| ${BASELINE_GAMES} | ${pct(baseFirstWins, BASELINE_GAMES)} | ${(baseShots / BASELINE_GAMES).toFixed(1)} |`,
      );
      lines.push(``);

      const out = lines.join("\n");
      writeFileSync("docs/balance-results.md", out);
      console.log("\n" + out);
      expect(matrixGames.flat().reduce((x, y) => x + y, 0)).toBe(
        N * N * GAMES_PER_PAIRING,
      );
    },
    900_000,
  );
});
