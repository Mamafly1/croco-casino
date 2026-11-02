// Plinko : à chaque rangée la bille va à gauche ou à droite (50/50). Retour moyen ≈ 97 %.
export const TABLES = {
  8:  { low: [5.1, 2.9, 1.4, 0.7, 0.5, 0.7, 1.4, 2.9, 5.1],
        medium: [13, 4.4, 1.2, 0.5, 0.4, 0.5, 1.2, 4.4, 13],
        high: [26, 6.5, 1, 0.2, 0.2, 0.2, 1, 6.5, 26] },
  9:  { low: [7, 3.8, 1.9, 0.9, 0.5, 0.5, 0.9, 1.9, 3.8, 7],
        medium: [22, 7.3, 1.9, 0.5, 0.4, 0.4, 0.5, 1.9, 7.3, 22],
        high: [57, 11, 1.4, 0.2, 0.2, 0.2, 0.2, 1.4, 11, 57] },
  10: { low: [10, 5.3, 2.5, 1.1, 0.6, 0.5, 0.6, 1.1, 2.5, 5.3, 10],
        medium: [33, 11, 3, 0.7, 0.4, 0.4, 0.4, 0.7, 3, 11, 33],
        high: [100, 19, 2.3, 0.3, 0.2, 0.2, 0.2, 0.3, 2.3, 19, 100] },
  11: { low: [13, 7.1, 3.5, 1.5, 0.7, 0.5, 0.5, 0.7, 1.5, 3.5, 7.1, 13],
        medium: [55, 18, 4.7, 1, 0.4, 0.4, 0.4, 0.4, 1, 4.7, 18, 55],
        high: [230, 34, 3.3, 0.3, 0.2, 0.2, 0.2, 0.2, 0.3, 3.3, 34, 230] },
  12: { low: [18, 9.8, 4.8, 2.1, 0.9, 0.5, 0.5, 0.5, 0.9, 2.1, 4.8, 9.8, 18],
        medium: [91, 29, 7.1, 1.5, 0.5, 0.4, 0.4, 0.4, 0.5, 1.5, 7.1, 29, 91],
        high: [500, 61, 4.8, 0.4, 0.2, 0.2, 0.2, 0.2, 0.2, 0.4, 4.8, 61, 500] },
};

export function probs(N) {
  const a = [];
  let c = 1;
  const tot = 2 ** N;
  for (let k = 0; k <= N; k++) { a.push(c / tot); c = (c * (N - k)) / (k + 1); }
  return a;
}

export function rtp(rows, risk) {
  const p = probs(rows), t = TABLES[rows][risk];
  return p.reduce((s, x, k) => s + x * t[k], 0);
}

export function valid(rows, risk) {
  return !!(TABLES[rows] && TABLES[rows][risk]);
}

export function drop(rows, risk, rng) {
  const path = [];
  let k = 0;
  for (let i = 0; i < rows; i++) { const v = rng() < 0.5 ? 0 : 1; path.push(v); k += v; }
  return { path, k, mult: TABLES[rows][risk][k] };
}
