// Bourse : trois entreprises dont le cours bouge chaque minute, avec des actus qui font des sauts.
// Le serveur garde l'état et le fait avancer quand quelqu'un regarde (le hasard vient du serveur, personne ne peut prévoir).
export const FEE = 0.01; // 1 % à l'achat et à la vente
export const COMPANIES = [
  { id: 'caca', name: 'Caca Cola', sector: 'Boissons', base: 48 },
  { id: 'children', name: 'Children', sector: 'Chocolat', base: 26 },
  { id: 'peer', name: 'Peer', sector: 'Tech', base: 180 },
];
const NEWS = {
  caca: {
    up: ['Caca Cola lance une boisson au goût « mystère » : rupture de stock', 'Un influenceur boit 40 Caca Cola en live', 'Caca Cola sponsorise la Coupe du monde de pétanque', 'La recette secrète retrouvée dans un tiroir'],
    down: ['Une canette de Caca Cola explose dans un frigo', 'Scandale : la recette contient vraiment du caca ?', 'Le nouveau logo de Caca Cola ne plaît à personne', 'Grève des livreurs de canettes'],
  },
  children: {
    up: ['Children sort un œuf surprise avec un vrai croco dedans', 'Pénurie de chocolat chez les concurrents', 'Children élu goûter préféré des bureaux', 'Les Children Bueno arrivent en taille XXL'],
    down: ['Les surprises Children sont toutes les mêmes cette année', 'Une usine Children inondée de chocolat fondu', 'Children accusé de mettre moins de chocolat dans les œufs', 'Un dentiste lance une pétition contre Children'],
  },
  peer: {
    up: ['Peer dévoile le PeerPhone 47 : il a une pomme… pardon, une poire', 'Le PeerBook se vend comme des petits pains', 'Peer rachète une start-up de jus de poire', 'Les PeerPods ne tombent plus des oreilles'],
    down: ['Le PeerPhone plie dans la poche', 'Peer supprime la prise jack… du chargeur', 'Panne mondiale du PeerCloud', 'Peer condamné : la poire était une pomme'],
  },
};
const MIN = 60000, HIST = 1440; // un point par minute, une journée d'historique
const SIGMA = 0.003, REVERT = 0.0005, NEWS_P = 0.012;

function gauss(rng) { let u = 0; while (!u) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
const r2 = (x) => Math.round(x * 100) / 100;

export function newMarket(now) {
  const t = Math.floor(now / MIN);
  return { t, prices: Object.fromEntries(COMPANIES.map((c) => [c.id, c.base])), hist: Object.fromEntries(COMPANIES.map((c) => [c.id, [c.base]])), news: [] };
}

// Fait avancer le marché jusqu'à maintenant (une étape par minute écoulée). Renvoie true si quelque chose a bougé.
export function advance(m, now, rng) {
  const t = Math.floor(now / MIN);
  let steps = t - m.t;
  if (steps <= 0) return false;
  if (steps > HIST) steps = HIST;
  for (let s = steps; s > 0; s--) {
    const at = (t - s + 1) * MIN;
    for (const c of COMPANIES) {
      let p = m.prices[c.id];
      let lr = -REVERT * Math.log(p / c.base) + SIGMA * gauss(rng);
      if (rng() < NEWS_P) {
        const upNews = rng() < 0.5, jump = 0.04 + rng() * 0.12;
        lr += Math.log(upNews ? 1 + jump : 1 - jump);
        const list = NEWS[c.id][upNews ? 'up' : 'down'];
        m.news.unshift({ at, co: c.id, text: list[Math.floor(rng() * list.length)], pct: r2((upNews ? jump : -jump) * 100) });
      }
      p = Math.max(0.5, p * Math.exp(lr));
      m.prices[c.id] = r2(p);
      const h = m.hist[c.id];
      h.push(m.prices[c.id]);
      if (h.length > HIST) h.splice(0, h.length - HIST);
    }
  }
  m.news.length = Math.min(m.news.length, 12);
  m.t = t;
  return true;
}

// Derniers cours connus : servent à compter les actions dans le score
export const marks = {};
export function setMarks(prices) { Object.assign(marks, prices); }
