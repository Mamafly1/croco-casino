// Génère data/cases.json : caisses et skins de l'API publique ByMykel/CSGO-API (données extraites des fichiers
// du jeu), prix du marché Skinport en euros.
// Usage : node tools/build-cases.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/';
const IMG = 'https://community.akamai.steamstatic.com/economy/image/';
const WEAR_NAMES = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
const WEAR_MAX = [0.07, 0.15, 0.38, 0.45, 1];
const KEY_USD = 2.5; // prix de la clé annoncé par Valve

async function json(url, headers) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (attempt >= 8) throw e;
      await new Promise((s) => setTimeout(s, 5000));
    }
  }
}

const [crates, skins, market, fx] = await Promise.all([
  json(BASE + 'crates.json'),
  json(BASE + 'skins.json'),
  // L'API Skinport exige la compression brotli
  json('https://api.skinport.com/v1/items?app_id=730&currency=EUR&tradable=0', { 'Accept-Encoding': 'br' }),
  json('https://api.frankfurter.dev/v1/latest?from=USD&to=EUR'),
]);
const byId = new Map(skins.map((s) => [s.id, s]));
const money = (x) => Math.round(x * 100) / 100;

// Un Doppler a une ligne par phase (version) en plus de la ligne générale
const prices = new Map();
for (const x of market) {
  const v = x.suggested_price ?? x.median_price ?? x.min_price;
  if (v) prices.set(`${x.market_hash_name}|${x.version || ''}`, v);
}
const priceOf = (name, ph) => prices.get(`${name}|${ph || ''}`) ?? prices.get(`${name}|`) ?? null;

// « ★ Karambit | Fade » + StatTrak -> « ★ StatTrak™ Karambit | Fade »
const stName = (n) => (n.startsWith('★ ') ? `★ StatTrak™ ${n.slice(2)}` : `StatTrak™ ${n}`);

// Le marché n'a pas toutes les usures : on complète avec l'usure connue la plus proche
function fill(list) {
  return list.map((v, i) => {
    if (v != null) return v;
    for (let d = 1; d < list.length; d++) {
      const near = list[i - d] ?? list[i + d];
      if (near != null) return near;
    }
    return null;
  });
}

// Prix par usure (une seule valeur pour un objet sans usure)
function pricesFor(n, f, ph) {
  const read = (name) => (f ? WEAR_NAMES.map((w, i) => {
    const lo = i ? WEAR_MAX[i - 1] : 0;
    return f[0] < WEAR_MAX[i] && f[1] > lo ? priceOf(`${name} (${w})`, ph) : null;
  }) : [priceOf(name, ph)]);
  return { pr: fill(read(n)), prs: fill(read(stName(n))) };
}

// Rareté dans une caisse -> palier de tirage
const TIER = {
  rarity_rare_weapon: 'milspec',
  rarity_mythical_weapon: 'restricted',
  rarity_legendary_weapon: 'classified',
  rarity_ancient_weapon: 'covert',
};
const short = (u) => (u && u.startsWith(IMG) ? u.slice(IMG.length) : u || '');

function item(it, tier) {
  const s = byId.get(it.id) || {};
  const f = s.min_float == null ? null : [s.min_float, s.max_float]; // null = sans usure (couteau « vanilla »)
  return {
    n: it.name,
    t: tier,
    i: short(it.image),
    f,
    st: !!s.stattrak,
    p: Number(s.paint_index) || 0, // index de peinture pour le visualiseur 3D
    ...(it.phase ? { ph: it.phase } : {}),
    ...pricesFor(it.name, f, it.phase),
  };
}

const key = money(KEY_USD * fx.rates.EUR);
const out = crates
  .filter((c) => c.type === 'Case' && c.contains?.length)
  .map((c) => {
    const items = c.contains.map((it) => item(it, TIER[it.rarity.id])).filter((x) => x.t);
    const rare = (c.contains_rare || []).map((it) => item(it, 'rare'));
    return { id: c.id, n: c.name, d: c.first_sale_date, i: short(c.image), pr: priceOf(c.name), key, items, rare };
  })
  .filter((c) => c.items.length && c.rare.length)
  .sort((a, b) => String(b.d).localeCompare(String(a.d)));

// Sans prix pour le palier entier : la médiane des objets de ce palier, pour ne jamais vendre à 0 €
const all = out.flatMap((c) => [...c.items, ...c.rare]);
const median = (list) => list.sort((a, b) => a - b)[list.length >> 1];
const tierMedian = (t) => median(all.filter((x) => x.t === t).flatMap((x) => x.pr).filter((v) => v != null));
let unpriced = 0;
for (const it of all) {
  if (it.pr.some((v) => v == null)) { unpriced++; it.pr = it.pr.map(() => tierMedian(it.t)); }
  if (it.prs.some((v) => v == null)) it.prs = it.pr; // shortcut: StatTrak sans prix = prix normal, à corriger si la source s'améliore
}

// Vérifications : le jeu ne doit jamais tomber sur un prix manquant ou un skin sans peinture
for (const c of out) {
  if (!(c.pr > 0)) throw new Error(`Pas de prix pour ${c.n}`);
  for (const it of [...c.items, ...c.rare]) {
    if (!it.pr.every((v) => v > 0) || (it.f && !it.p)) throw new Error(`Objet incomplet : ${it.n}`);
  }
}

const dir = new URL('../data/cases.json', import.meta.url);
writeFileSync(dir, JSON.stringify({ img: IMG, pricesAt: new Date().toISOString().slice(0, 10), cases: out }));
console.log(out.length, 'caisses,', all.length, 'objets,', unpriced, 'sans aucun prix, clé', key, '€');
