import { RULES, type Rules } from "./rules";
import type { Coord } from "./types";

const ROW_A = "A".charCodeAt(0);

export function inBounds(c: Coord, rules: Rules = RULES): boolean {
  return c.row >= 0 && c.row < rules.rows && c.col >= 0 && c.col < rules.cols;
}

export function coordKey(c: Coord): string {
  return `${c.row},${c.col}`;
}

export function coordLabel(c: Coord): string {
  return `${String.fromCharCode(ROW_A + c.row)}${c.col + 1}`;
}

export function parseLabel(label: string, rules: Rules = RULES): Coord | null {
  const m = /^([A-Z])(\d{1,2})$/.exec(label);
  if (!m) {
    return null;
  }
  const [, letter, digits] = m;
  if (letter === undefined || digits === undefined) {
    return null;
  }
  const c = { row: letter.charCodeAt(0) - ROW_A, col: Number(digits) - 1 };
  return inBounds(c, rules) ? c : null;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

/** Up, down, left, right — clipped at the board edge. */
export function orthogonalNeighbors(c: Coord, rules: Rules = RULES): Coord[] {
  const deltas: readonly Coord[] = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];
  const out: Coord[] = [];
  for (const d of deltas) {
    const n = { row: c.row + d.row, col: c.col + d.col };
    if (inBounds(n, rules)) {
      out.push(n);
    }
  }
  return out;
}
