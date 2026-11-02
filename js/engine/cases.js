// Ouverture de caisses CS2.
// Taux par palier : ceux publiés par Valve (79,92 / 15,98 / 3,20 / 0,64 / 0,26 %), StatTrak 10 %.
// Dans un palier, chaque objet a la même chance (hypothèse courante, Valve ne détaille pas).
// Le float est tiré uniformément entre le min et le max du skin (approximation).
// Les valeurs en € sont des valeurs de JEU fixées ici, pas des prix du marché Steam.
export const ODDS = { milspec: 0.7992, restricted: 0.1598, classified: 0.032, covert: 0.0064, rare: 0.0026 };
export const TIERS = ['milspec', 'restricted', 'classified', 'covert', 'rare'];
export const TIER_INFO = {
  milspec: { name: 'Mil-Spec', color: '#4b69ff', value: 0.6 },
  restricted: { name: 'Restricted', color: '#8847ff', value: 3 },
  classified: { name: 'Classified', color: '#d32ce6', value: 12 },
  covert: { name: 'Covert', color: '#eb4b4b', value: 50 },
  rare: { name: 'Couteau / Gants', color: '#ffbf17', value: 180 },
};
export const CASE_PRICE = 2.5;
export const ST_RATE = 0.1;
export const ST_MULT = 1.5;
export const WEARS = [
  { id: 'FN', name: 'Factory New', max: 0.07, mult: 1.5 },
  { id: 'MW', name: 'Minimal Wear', max: 0.15, mult: 1.15 },
  { id: 'FT', name: 'Field-Tested', max: 0.38, mult: 1 },
  { id: 'WW', name: 'Well-Worn', max: 0.45, mult: 0.85 },
  { id: 'BS', name: 'Battle-Scarred', max: 1, mult: 0.75 },
];

export function wearOf(f) {
  return WEARS.find((w) => f < w.max) || WEARS[WEARS.length - 1];
}

function pool(c, tier) { return tier === 'rare' ? c.rare : c.items.filter((x) => x.t === tier); }

// Probabilité d'usure pour un skin à float uniforme dans [a, b]
export function wearProbs(f) {
  if (!f) return null;
  const [a, b] = f;
  let lo = 0;
  return WEARS.map((w) => {
    const hi = w.max;
    const p = b > a ? Math.max(0, Math.min(b, hi) - Math.max(a, lo)) / (b - a) : (a >= lo && a < hi ? 1 : 0);
    lo = hi;
    return { ...w, p };
  });
}

// Retour moyen visé : les valeurs de chaque caisse sont ajustées pour que l'objet moyen vaille 90 % du prix.
export const TARGET_RTP = 0.9;
const factors = new WeakMap();
export function factor(c) {
  if (!factors.has(c)) factors.set(c, TARGET_RTP / baseRtp(c));
  return factors.get(c);
}

export function itemValue(c, tier, wear, st) {
  return Math.round(TIER_INFO[tier].value * factor(c) * (wear ? wear.mult : 1) * (st ? ST_MULT : 1) * 100) / 100;
}

export function rtp(c) { return baseRtp(c) * factor(c); }

// Retour moyen avec les valeurs de base (valeur moyenne de l'objet / prix)
function baseRtp(c) {
  let ev = 0;
  for (const tier of TIERS) {
    const list = pool(c, tier);
    if (!list.length) continue;
    for (const it of list) {
      const pw = wearProbs(it.f);
      const wearMean = pw ? pw.reduce((s, w) => s + w.p * w.mult, 0) : 1;
      const stMean = it.st ? 1 - ST_RATE + ST_RATE * ST_MULT : 1;
      ev += (ODDS[tier] / list.length) * TIER_INFO[tier].value * wearMean * stMean;
    }
  }
  return ev / CASE_PRICE;
}

export function open(c, rng) {
  let r = rng(), tier = TIERS[0];
  for (const t of TIERS) { if (r < ODDS[t]) { tier = t; break; } r -= ODDS[t]; }
  const list = pool(c, tier);
  const idx = Math.floor(rng() * list.length);
  const it = list[idx];
  const float = it.f ? it.f[0] + rng() * (it.f[1] - it.f[0]) : null;
  const wear = float == null ? null : wearOf(float);
  const st = it.st && rng() < ST_RATE;
  return {
    n: it.n, t: tier, i: it.i, ph: it.ph || null,
    float: float == null ? null : Math.round(float * 1e9) / 1e9,
    range: it.f, wear: wear ? wear.id : null, st,
    value: itemValue(c, tier, wear, st),
  };
}
