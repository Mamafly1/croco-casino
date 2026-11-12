// Ouverture de caisses CS2.
// Taux par palier : ceux publiés par Valve (79,92 / 15,98 / 3,20 / 0,64 / 0,26 %), StatTrak 10 %.
// Dans un palier, chaque objet a la même chance (hypothèse courante, Valve ne détaille pas).
// Le float est tiré uniformément entre le min et le max du skin (approximation).
// Les prix sont ceux du marché (tools/build-cases.mjs) : une ouverture coûte la caisse plus la clé.
export const ODDS = { milspec: 0.7992, restricted: 0.1598, classified: 0.032, covert: 0.0064, rare: 0.0026 };
export const TIERS = ['milspec', 'restricted', 'classified', 'covert', 'rare'];
export const TIER_INFO = {
  milspec: { name: 'Mil-Spec', color: '#4b69ff' },
  restricted: { name: 'Restricted', color: '#8847ff' },
  classified: { name: 'Classified', color: '#d32ce6' },
  covert: { name: 'Covert', color: '#eb4b4b' },
  rare: { name: 'Couteau / Gants', color: '#ffbf17' },
};
export const ST_RATE = 0.1;
export const WEARS = [
  { id: 'FN', name: 'Factory New', max: 0.07 },
  { id: 'MW', name: 'Minimal Wear', max: 0.15 },
  { id: 'FT', name: 'Field-Tested', max: 0.38 },
  { id: 'WW', name: 'Well-Worn', max: 0.45 },
  { id: 'BS', name: 'Battle-Scarred', max: 1 },
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

// Rareté d'un objet obtenu : il y avait 1 chance sur N de tirer exactement ce skin, dans cette usure et ce StatTrak
export function rarity(it, c) {
  if (!c || !it) return 0;
  const list = pool(c, it.t);
  if (!list.length) return 0;
  const src = list.find((x) => x.n === it.n);
  let p = ODDS[it.t] / list.length;
  const pw = src && wearProbs(src.f);
  if (pw && it.wear) { const w = pw.find((x) => x.id === it.wear); if (w && w.p > 0) p *= w.p; }
  if (src && src.st) p *= it.st ? ST_RATE : 1 - ST_RATE;
  return p > 0 ? Math.round(1 / p) : 0;
}

export function cost(c) { return Math.round((c.pr + c.key) * 100) / 100; }

function priceOf(it, wear, st) {
  const list = st ? it.prs : it.pr;
  return list[wear ? WEARS.indexOf(wear) : 0];
}

// Prix moyen d'un objet tiré, en tenant compte de l'usure et du StatTrak
function meanPrice(it) {
  const st = it.st ? ST_RATE : 0;
  const pw = wearProbs(it.f);
  const mean = (list) => (pw ? pw.reduce((s, w, i) => s + w.p * list[i], 0) : list[0]);
  return (1 - st) * mean(it.pr) + st * mean(it.prs);
}

// Part du prix d'ouverture que l'objet vaut en moyenne
export function rtp(c) {
  let ev = 0;
  for (const tier of TIERS) {
    const list = pool(c, tier);
    for (const it of list) ev += (ODDS[tier] / list.length) * meanPrice(it);
  }
  return ev / cost(c);
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
    seed: Math.floor(rng() * 1001),
    value: priceOf(it, wear, st),
  };
}
