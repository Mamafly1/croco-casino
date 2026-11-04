// Fusée (crash) : le multiplicateur monte, la fusée explose à un point tiré au départ.
// P(explosion après ×m) = 0,99 / m : quel que soit le moment où tu retires, le retour moyen est 99 %.
export const K = 0.00006;          // vitesse de montée : ×2 en 11,6 s, ×10 en 38 s
export const MAX = 1000;
export const mult = (ms) => Math.floor(100 * Math.exp(K * Math.max(0, ms))) / 100;
export const timeTo = (m) => Math.log(m) / K;

export function crashPoint(rng) {
  const m = Math.floor(99 / (1 - rng())) / 100; // 1 % des fusées explosent tout de suite (×1,00)
  return Math.min(MAX, Math.max(1, m));
}
