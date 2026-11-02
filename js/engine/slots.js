// Machine à sous 3 rouleaux × 3 rangées, 5 lignes. Chaque rouleau a 32 cases.
// La mise totale est répartie sur les 5 lignes. Le retour moyen est calculé exactement par rtp().
export const SYMBOLS = ['croco', 'seven', 'diamond', 'bar', 'bell', 'lemon', 'cherry'];
export const COUNTS = { croco: 1, seven: 2, diamond: 3, bar: 5, bell: 6, lemon: 7, cherry: 8 };
export const PAYS = { croco: 500, seven: 150, diamond: 60, bar: 35, bell: 24, lemon: 18, cherry: 15 }; // 3 identiques, × mise de la ligne
export const TWO_CHERRIES = 3; // deux cerises sur les deux premiers rouleaux
export const LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]]; // rangée par rouleau

// Bandes fixes, mélangées une fois pour toutes (même contenu sur les 3 rouleaux, ordres différents).
function strip(seed) {
  const s = [];
  for (const sym of SYMBOLS) for (let i = 0; i < COUNTS[sym]; i++) s.push(sym);
  let x = seed;
  for (let i = s.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648;
    const j = x % (i + 1);
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}
export const STRIPS = [strip(7), strip(42), strip(1337)];
const L = 32;

export function lineMult(a, b, c) {
  if (a === b && b === c) return PAYS[a];
  if (a === 'cherry' && b === 'cherry') return TWO_CHERRIES;
  return 0;
}

export function rtp() {
  const p = Object.fromEntries(SYMBOLS.map((s) => [s, COUNTS[s] / L]));
  let e = 0;
  for (const s of SYMBOLS) e += p[s] ** 3 * PAYS[s];
  e += p.cherry * p.cherry * (1 - p.cherry) * TWO_CHERRIES;
  return e;
}

export function spin(rng) {
  const stops = STRIPS.map(() => Math.floor(rng() * L));
  // grid[row][reel] : la rangée du milieu est la case tirée, les autres sont ses voisines
  const grid = [0, 1, 2].map((row) => stops.map((st, r) => STRIPS[r][(st + row - 1 + L) % L]));
  const lines = [];
  LINES.forEach((rows, i) => {
    const m = lineMult(grid[rows[0]][0], grid[rows[1]][1], grid[rows[2]][2]);
    if (m) lines.push({ line: i, mult: m, sym: grid[rows[0]][0] });
  });
  return { stops, grid, lines, mult: lines.reduce((s, l) => s + l.mult, 0) / LINES.length };
}
