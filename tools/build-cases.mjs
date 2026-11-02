// Génère data/cases.json à partir de l'API publique ByMykel/CSGO-API (données extraites des fichiers du jeu).
// Usage : node tools/build-cases.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/';
const IMG = 'https://community.akamai.steamstatic.com/economy/image/';

const [crates, skins] = await Promise.all(
  ['crates.json', 'skins.json'].map((f) => fetch(BASE + f).then((r) => r.json()))
);
const byId = new Map(skins.map((s) => [s.id, s]));

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
  return {
    n: it.name,
    t: tier,
    i: short(it.image),
    f: s.min_float == null ? null : [s.min_float, s.max_float], // null = sans usure (couteau « vanilla »)
    st: !!s.stattrak,
    ...(it.phase ? { ph: it.phase } : {}),
  };
}

const out = crates
  .filter((c) => c.type === 'Case' && c.contains?.length)
  .map((c) => {
    const items = c.contains.map((it) => item(it, TIER[it.rarity.id])).filter((x) => x.t);
    const rare = (c.contains_rare || []).map((it) => item(it, 'rare'));
    return { id: c.id, n: c.name, d: c.first_sale_date, i: short(c.image), items, rare };
  })
  .filter((c) => c.items.length && c.rare.length)
  .sort((a, b) => String(b.d).localeCompare(String(a.d)));

writeFileSync(new URL('../data/cases.json', import.meta.url), JSON.stringify({ img: IMG, cases: out }));
console.log(out.length, 'caisses');
