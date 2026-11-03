// Plinko : à chaque rangée la bille va à gauche ou à droite (50/50). Retour moyen ≈ 99 %.
export const TABLES = {
  8:  { low: [5.2, 3.2, 1.4, 0.7, 0.5, 0.7, 1.4, 3.2, 5.2],
        medium: [13, 4.4, 1.3, 0.5, 0.4, 0.5, 1.3, 4.4, 13],
        high: [27, 6.7, 1, 0.2, 0.2, 0.2, 1, 6.7, 27] },
  9:  { low: [6.8, 4, 2, 0.9, 0.5, 0.5, 0.9, 2, 4, 6.8],
        medium: [22, 7.4, 2, 0.5, 0.4, 0.4, 0.5, 2, 7.4, 22],
        high: [58, 11, 1.5, 0.2, 0.2, 0.2, 0.2, 1.5, 11, 58] },
  10: { low: [10, 5.4, 2.7, 1.1, 0.6, 0.5, 0.6, 1.1, 2.7, 5.4, 10],
        medium: [34, 11, 3.2, 0.7, 0.4, 0.4, 0.4, 0.7, 3.2, 11, 34],
        high: [100, 20, 2.3, 0.3, 0.2, 0.2, 0.2, 0.3, 2.3, 20, 100] },
  11: { low: [13, 7, 3.6, 1.6, 0.7, 0.5, 0.5, 0.7, 1.6, 3.6, 7, 13],
        medium: [53, 18, 4.8, 1.1, 0.4, 0.4, 0.4, 0.4, 1.1, 4.8, 18, 53],
        high: [234, 35, 3.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.3, 3.4, 35, 234] },
  12: { low: [16, 11, 4.9, 2.2, 0.9, 0.5, 0.5, 0.5, 0.9, 2.2, 4.9, 11, 16],
        medium: [91, 30, 7.2, 1.6, 0.5, 0.4, 0.4, 0.4, 0.5, 1.6, 7.2, 30, 91],
        high: [510, 63, 4.9, 0.4, 0.2, 0.2, 0.2, 0.2, 0.2, 0.4, 4.9, 63, 510] },
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
