// Roulette européenne : un seul zéro, 37 cases. Retour moyen 36/37 ≈ 97,3 % pour toutes les mises.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function color(n) { return n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black'; }

// Retour total (mise comprise) pour 1 € misé sur `key` si la bille tombe sur `n`. 0 = perdu.
export function returnFor(key, n) {
  const [kind, arg] = key.split(':');
  const a = +arg;
  switch (kind) {
    case 'n': return n === a ? 36 : 0;
    case 'red': return n !== 0 && REDS.has(n) ? 2 : 0;
    case 'black': return n !== 0 && !REDS.has(n) ? 2 : 0;
    case 'odd': return n !== 0 && n % 2 === 1 ? 2 : 0;
    case 'even': return n !== 0 && n % 2 === 0 ? 2 : 0;
    case 'low': return n >= 1 && n <= 18 ? 2 : 0;
    case 'high': return n >= 19 ? 2 : 0;
    case 'dozen': return n !== 0 && Math.ceil(n / 12) === a ? 3 : 0;
    case 'col': return n !== 0 && ((n - 1) % 3) + 1 === a ? 3 : 0;
    default: return 0;
  }
}

export function validKey(key) {
  if (typeof key !== 'string') return false;
  const [kind, arg] = key.split(':');
  const a = Number(arg);
  if (kind === 'n') return Number.isInteger(a) && a >= 0 && a <= 36;
  if (kind === 'dozen' || kind === 'col') return a === 1 || a === 2 || a === 3;
  return ['red', 'black', 'odd', 'even', 'low', 'high'].includes(kind) && arg === undefined;
}

export function settle(bets, n) {
  let total = 0;
  for (const [key, amount] of Object.entries(bets)) total += amount * returnFor(key, n);
  return Math.round(total * 100) / 100;
}

export function spin(rng) {
  return Math.floor(rng() * 37);
}
