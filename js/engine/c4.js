// Croco 4 : quatre pions à la suite (ligne, colonne ou diagonale) sur une grille de 7 colonnes et 6 rangées.
// Le plateau est une liste de colonnes, chacune remplie de bas en haut avec le numéro du joueur (0 ou 1).
export const COLS = 7, ROWS = 6;
export const C4_MOVE_MS = 30000; // temps pour jouer son coup
export const C4_VALUES = [1, 5, 10];
export const C4_MIN = 0.1, C4_MAX = 100;

export const newBoard = () => Array.from({ length: COLS }, () => []);
export const canDrop = (b, c) => Number.isInteger(c) && c >= 0 && c < COLS && b[c].length < ROWS;
export function drop(b, c, who) { b[c].push(who); return b[c].length - 1; }
export const full = (b) => b.every((col) => col.length >= ROWS);

// Les cases alignées (4 ou plus) qui passent par le pion posé en (c, r), sinon null
export function winLine(b, c, r) {
  const who = b[c][r];
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const cells = [[c, r]];
    for (const s of [1, -1]) {
      let x = c + dc * s, y = r + dr * s;
      while (x >= 0 && x < COLS && y >= 0 && y < ROWS && b[x][y] === who) { cells.push([x, y]); x += dc * s; y += dr * s; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}
