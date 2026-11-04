// Règles communes au mode solo (navigateur) et au serveur multijoueur.
// `p` est le joueur : { balance, deposits, inventory, played, bj }. Les fonctions le modifient.
import * as plinko from './plinko.js';
import * as roulette from './roulette.js';
import * as slots from './slots.js';
import * as bj from './blackjack.js';
import * as cases from './cases.js';
import * as crash from './crash.js';
import * as work from './work.js';
import { COMPANIES, FEE, marks } from './market.js';

export const GAMES = ['plinko', 'roulette', 'blackjack', 'cases', 'slots', 'crash', 'rps', 'stocks'];
export const PACKS = [10, 20, 50, 100]; // montants proposés au dépôt (pris sur le compte en banque)
// Gifs envoyés sur l'écran des autres : prix par gif selon le mode d'apparition
export const GIF_PRICES = { dvd: 1.5, gravity: 2.5, full: 10 };
export const GIF_MODES = { dvd: 'DVD', gravity: 'Gravité', full: 'Plein écran' };
export const GIF_MAX_SEND = 30;
export const RPS_MULT = 1.97; // contre le croco : gagné ×1,97, égalité remboursée → retour 99 %
export const RPS_MOVES = ['pierre', 'feuille', 'ciseaux'];
export const MIN_BET = 0.1;
export const MAX_BET = 1000;
export const MAX_INVENTORY = 300;

export class GameError extends Error {}
const BROKE = 'Solde insuffisant. Fais un dépôt pour jouer.';

export const money = (x) => Math.round(x * 100) / 100;

// Prochaine ouverture tirée à l'avance : la page peut charger la 3D de l'objet avant le clic.
// Le tirage est le même qu'à l'ouverture, juste fait plus tôt ; il est gardé jusqu'à ce que cette caisse soit ouverte,
// donc changer de caisse ou recharger la page ne le refait pas.
// En ligne aussi (choix de l'utilisateur, site entre amis) : l'indice envoyé au navigateur est seulement brouillé.
// Quelqu'un d'assez curieux peut donc connaître ses prochains objets et choisir sa caisse en conséquence.
export function nextOpen(p, c, rng) {
  p.next = p.next || {};
  if (!p.next[c.id]) p.next[c.id] = cases.open(c, rng);
  return p.next[c.id];
}
// Brouillage de l'indice : pas un chiffrement, juste de quoi ne pas le lire en clair dans les messages
export function encodeHint(o) {
  const b = btoa(encodeURIComponent(JSON.stringify(o)));
  return b.split('').reverse().join('');
}
export function decodeHint(h) {
  return JSON.parse(decodeURIComponent(atob(String(h).split('').reverse().join(''))));
}
function takeNext(p, c, rng) {
  const it = p.next && p.next[c.id];
  if (!it) return cases.open(c, rng);
  delete p.next[c.id];
  return it;
}

// Libellé court d'un mouvement de solde, pour l'historique du profil (même texte en solo et en ligne)
export function historyLabel(game, action, params, result, feed) {
  if (game === 'wallet') return 'Dépôt';
  if (game === 'work') return 'Travail : ' + (result.title || 'tâche');
  if (game === 'gifs') return action === 'buy' ? `Gifs : ${params.qty}× ${GIF_MODES[params.mode] || ''} en stock` : `Gifs : ${params.qty}× envoyés${params.to ? ' à ' + params.to : ''}`;
  if (game === 'crash') return result.mult ? `Fusée ×${String(result.mult).replace('.', ',')}` : result.point != null ? `Fusée : explosée à ×${String(result.point).replace('.', ',')}` : 'Fusée : mise';
  if (game === 'rps') return result.label && result.label.startsWith('Chifoumi') ? result.label : `Chifoumi : ${result.cancelled ? 'défi annulé' : ({ win: 'gagné', lose: 'perdu', draw: 'égalité' })[result.outcome] || result.label || 'défi lancé'}`;
  if (game === 'stocks') { const c = COMPANIES.find((x) => x.id === params.co); return `Bourse : ${action === 'buy' ? 'achat' : 'vente'} ${c ? c.name : ''}`; }
  if (game === 'plinko') return `Plinko ×${String(result.mult).replace('.', ',')}`;
  if (game === 'slots') return result.payout > 0 ? `Machine à sous ×${String(money(result.payout / result.bet)).replace('.', ',')}` : 'Machine à sous';
  if (game === 'roulette') return result.n != null ? `Roulette : ${result.n}` : 'Roulette : mise';
  if (game === 'blackjack') {
    if (feed) return 'Blackjack : ' + ({ win: 'gagné', blackjack: 'blackjack', push: 'égalité', lose: 'perdu', bust: 'sauté' }[feed.result] || feed.result);
    return action === 'deal' ? 'Blackjack : mise' : params.action === 'double' ? 'Blackjack : double' : 'Blackjack : séparation';
  }
  if (game === 'cases') return action === 'open' ? `Caisse : ${result.item.n}` : params.all ? 'Vente de l’inventaire' : 'Vente';
  return game;
}

export function newPlayer() {
  return { balance: 0, deposits: 0, inventory: [], played: {}, bj: null, gifs: {}, spent: 0, stocks: {}, crash: null, work: null, bank: 0 };
}

export function inventoryValue(p) {
  return money(p.inventory.reduce((s, it) => s + it.value, 0));
}

// Valeur des actions au dernier cours connu
export function stocksValue(p, prices = marks) {
  let v = 0;
  for (const [co, h] of Object.entries(p.stocks || {})) v += h.sh * (prices[co] ?? (h.sh ? h.cost / h.sh : 0));
  return money(v);
}

// Score du classement : ce que tu possèdes au casino moins ce que tu y as déposé (l'argent en banque ne compte pas).
// L'argent dépensé en gifs ne fait pas perdre de points : il reste compté (sinon personne n'en enverrait).
export function score(p) {
  return money(p.balance + inventoryValue(p) + stocksValue(p) + (p.spent || 0) - p.deposits);
}

export function readBet(p, raw) {
  const bet = money(Number(raw));
  if (!Number.isFinite(bet) || bet < MIN_BET) throw new GameError('Mise minimum 0,10 €.');
  if (bet > MAX_BET) throw new GameError('Mise maximum 1 000 €.');
  if (bet > p.balance + 1e-9) throw new GameError(BROKE);
  return bet;
}

export function readRouletteBets(p, raw) {
  if (!raw || typeof raw !== 'object') throw new GameError('Aucune mise.');
  const bets = {};
  let total = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (!roulette.validKey(k)) throw new GameError('Mise inconnue.');
    const a = money(Number(v));
    if (!Number.isFinite(a) || a < MIN_BET) throw new GameError('Mise minimum 0,10 € par case.');
    bets[k] = a;
    total += a;
  }
  total = money(total);
  if (!total) throw new GameError('Aucune mise.');
  if (total > MAX_BET) throw new GameError('Mise maximum 1 000 € par tour.');
  if (total > p.balance + 1e-9) throw new GameError(BROKE);
  return { bets, total };
}

function played(p, game) { p.played[game] = (p.played[game] || 0) + 1; }

function uid(rng) {
  let s = '';
  for (let i = 0; i < 10; i++) s += Math.floor(rng() * 36).toString(36);
  return s;
}

// ctx = { rng, caseList, now, prices }
export function run(p, game, action, params = {}, ctx) {
  const { rng } = ctx;
  const out = (result, feed) => ({ result: { ...result, balance: p.balance }, feed });

  if (!p.gifs) p.gifs = {};
  if (!p.stocks) p.stocks = {};
  if (!p.spent) p.spent = 0;
  if (!p.bank) p.bank = 0;
  const now = ctx.now || Date.now();

  // ---------- dépôt : de ton compte en banque (rempli par le travail) vers le casino ----------
  if (game === 'wallet' && action === 'deposit') {
    const amount = params.pack === 'all' ? money(p.bank) : PACKS[params.pack];
    if (!amount) throw new GameError(params.pack === 'all' ? 'Ton compte en banque est vide : va travailler.' : 'Montant inconnu.');
    if (amount > p.bank + 1e-9) {
      throw new GameError(`Message de la banque\u00a0: paiement refusé. Solde restant\u00a0: ${p.bank.toFixed(2).replace('.', ',')}\u00a0€`);
    }
    p.bank = money(p.bank - amount);
    p.balance = money(p.balance + amount);
    p.deposits = money(p.deposits + amount);
    return out({ amount, bank: p.bank, payout: amount });
  }

  // ---------- travail du jour ----------
  if (game === 'work') {
    const day = work.workDay(now);
    if (!p.work || p.work.day !== day) p.work = work.newDay(rng, day);
    if (action === 'today') return out({ ...p.work, bank: p.bank, payout: 0 });
    if (action === 'submit') {
      const t = p.work.tasks[Number(params.i)];
      if (!t) throw new GameError('Tâche inconnue.');
      if (t.done) throw new GameError('Tâche déjà faite aujourd’hui.');
      if (!work.checkTask(t.type, t.seed, params.ans)) throw new GameError('Ce n’est pas encore ça : vérifie et réessaie.');
      t.done = true;
      // la paie arrive sur le compte en banque ; on la dépose ensuite au casino (bouton Déposer)
      p.bank = money(p.bank + t.pay);
      return out({ ...p.work, title: work.TASKS[t.type].title, pay: t.pay, bank: p.bank, payout: 0 });
    }
  }

  // ---------- gifs : stock et envoi (la livraison est faite par le serveur) ----------
  if (game === 'gifs' && (action === 'buy' || action === 'send')) {
    const mode = String(params.mode), price = GIF_PRICES[mode];
    const qty = Math.floor(Number(params.qty));
    if (!price) throw new GameError('Mode d’apparition inconnu.');
    if (!(qty >= 1 && qty <= GIF_MAX_SEND)) throw new GameError(`Entre 1 et ${GIF_MAX_SEND} gifs à la fois.`);
    const stock = p.gifs[mode] || 0;
    const used = action === 'send' ? Math.min(stock, qty) : 0;
    const cost = money((qty - used) * price);
    if (cost > p.balance + 1e-9) throw new GameError(`Solde insuffisant : il faut ${cost.toFixed(2).replace('.', ',')} €.`);
    p.balance = money(p.balance - cost);
    p.spent = money(p.spent + cost);
    p.gifs[mode] = action === 'buy' ? stock + qty : stock - used;
    return out({ mode, qty, used, cost, stock: p.gifs[mode], payout: 0 });
  }

  // ---------- fusée ----------
  if (game === 'crash') {
    if (action === 'start') {
      if (p.crash && !crashSettle(p, now, false)) throw new GameError('Ta fusée vole encore.');
      const bet = readBet(p, params.bet);
      let auto = params.auto ? Math.floor(Number(params.auto) * 100) / 100 : null;
      if (auto != null && !(auto >= 1.01 && auto <= crash.MAX)) throw new GameError('Retrait auto : entre ×1,01 et ×1 000.');
      p.balance = money(p.balance - bet);
      p.crash = { bet, at: now, point: crash.crashPoint(rng), auto };
      played(p, 'crash');
      return out({ at: now, bet, auto, payout: 0 });
    }
    if (action === 'cash' || action === 'state') {
      if (!p.crash) {
        if (action === 'cash') throw new GameError('Aucune fusée en vol.');
        return out({ idle: true, payout: 0 });
      }
      const c = p.crash, r = crashSettle(p, now, action === 'cash');
      if (!r) return out({ flying: true, at: c.at, auto: c.auto, bet: c.bet, payout: 0 });
      return out({ ...r, done: true }, { game, bet: r.bet, payout: r.payout, mult: r.mult, point: r.point });
    }
  }

  // ---------- pierre-feuille-ciseaux contre le croco ----------
  if (game === 'rps' && action === 'bot') {
    const move = RPS_MOVES.indexOf(params.move);
    if (move < 0) throw new GameError('Choisis pierre, feuille ou ciseaux.');
    const bet = readBet(p, params.bet);
    const bot = Math.floor(rng() * 3);
    const outcome = rpsOutcome(move, bot);
    const payout = outcome === 'win' ? money(bet * RPS_MULT) : outcome === 'draw' ? bet : 0;
    p.balance = money(p.balance - bet + payout);
    played(p, 'rps');
    return out({ move: RPS_MOVES[move], other: RPS_MOVES[bot], outcome, bet, payout }, { game, bet, payout, outcome, vs: 'le croco' });
  }

  // ---------- bourse ----------
  if (game === 'stocks' && (action === 'buy' || action === 'sell')) {
    const c = COMPANIES.find((x) => x.id === params.co);
    if (!c) throw new GameError('Entreprise inconnue.');
    const price = ctx.prices && ctx.prices[c.id];
    if (!price) throw new GameError('Cours indisponible, réessaie.');
    const h = p.stocks[c.id] || { sh: 0, cost: 0 };
    const r6 = (x) => Math.round(x * 1e6) / 1e6;
    if (action === 'buy') {
      const amount = money(Number(params.amount));
      if (!(amount >= 1)) throw new GameError('Achat minimum 1 €.');
      if (amount > p.balance + 1e-9) throw new GameError(BROKE);
      const sh = r6((amount * (1 - FEE)) / price);
      h.sh = r6(h.sh + sh); h.cost = money(h.cost + amount);
      p.stocks[c.id] = h;
      p.balance = money(p.balance - amount);
      played(p, 'stocks');
      return out({ co: c.id, sh, price, amount, holding: h, payout: 0 }, { game, act: 'buy', co: c.name, amount, bet: 0, payout: 0 });
    }
    const sh = params.all ? h.sh : r6(Number(params.sh));
    if (!(sh > 0) || sh > h.sh + 1e-9) throw new GameError('Tu n’as pas autant d’actions.');
    const proceeds = money(sh * price * (1 - FEE));
    const costPart = money(h.sh ? (h.cost * sh) / h.sh : 0);
    h.sh = r6(h.sh - sh); h.cost = money(h.cost - costPart);
    if (h.sh < 1e-6) delete p.stocks[c.id]; else p.stocks[c.id] = h;
    p.balance = money(p.balance + proceeds);
    return out({ co: c.id, sh, price, proceeds, gain: money(proceeds - costPart), payout: 0 }, { game, act: 'sell', co: c.name, amount: proceeds, gain: money(proceeds - costPart), bet: 0, payout: 0 });
  }
  if (game === 'plinko' && action === 'drop') {
    const rows = Number(params.rows), risk = String(params.risk);
    if (!plinko.valid(rows, risk)) throw new GameError('Réglage inconnu.');
    const bet = readBet(p, params.bet);
    const d = plinko.drop(rows, risk, rng);
    const payout = money(bet * d.mult);
    p.balance = money(p.balance - bet + payout);
    played(p, 'plinko');
    return out({ ...d, rows, risk, bet, payout }, { game, bet, payout, mult: d.mult });
  }

  if (game === 'slots' && action === 'spin') {
    const bet = readBet(p, params.bet);
    const s = slots.spin(rng);
    const payout = money(bet * s.mult);
    p.balance = money(p.balance - bet + payout);
    played(p, 'slots');
    return out({ ...s, bet, payout }, { game, bet, payout, mult: s.mult });
  }

  if (game === 'roulette' && action === 'spin') {
    const { bets, total } = readRouletteBets(p, params.bets);
    const n = roulette.spin(rng);
    const payout = roulette.settle(bets, n);
    p.balance = money(p.balance - total + payout);
    played(p, 'roulette');
    return out({ n, bets, bet: total, payout }, { game, bet: total, payout, n });
  }

  if (game === 'blackjack' && action === 'deal') {
    if (p.bj && p.bj.phase === 'player') throw new GameError('Termine ta main en cours.');
    const bet = readBet(p, params.bet);
    p.balance = money(p.balance - bet);
    p.bj = bj.deal(bet, rng);
    played(p, 'blackjack');
    return finishBJ(p, bet, out);
  }

  if (game === 'blackjack' && action === 'act') {
    const s = p.bj;
    if (!s || s.phase !== 'player') throw new GameError('Aucune main en cours.');
    const a = String(params.action);
    if (!bj.canAct(s, a)) throw new GameError('Action impossible.');
    const extra = bj.extraCost(s, a);
    if (extra > p.balance + 1e-9) throw new GameError('Solde insuffisant pour ' + (a === 'split' ? 'séparer.' : 'doubler.'));
    p.balance = money(p.balance - extra);
    bj.act(s, a);
    return finishBJ(p, 0, out);
  }

  if (game === 'cases' && action === 'open') {
    const c = ctx.caseList.find((x) => x.id === params.caseId);
    if (!c) throw new GameError('Caisse inconnue.');
    if (p.inventory.length >= MAX_INVENTORY) throw new GameError('Inventaire plein : vends des objets.');
    const price = cases.cost(c);
    if (price > p.balance + 1e-9) throw new GameError(BROKE);
    const it = takeNext(p, c, rng);
    // La « roue » de l'animation : objets tirés au même hasard, le gagnant à la position 45
    const reel = [];
    for (let i = 0; i < 52; i++) {
      const x = i === 45 ? it : cases.open(c, rng);
      reel.push({ n: x.n, t: x.t, i: x.i });
    }
    const item = { ...it, uid: uid(rng), caseId: c.id, at: Date.now() };
    p.balance = money(p.balance - price);
    p.inventory.unshift(item);
    played(p, 'cases');
    // L'objet arrive dans l'inventaire : pas de gain en argent immédiat
    return out({ item, reel, bet: price, payout: 0 }, { game, bet: price, payout: item.value, item: { n: item.n, t: item.t, wear: item.wear, st: item.st, value: item.value } });
  }

  if (game === 'cases' && action === 'next') {
    const c = ctx.caseList.find((x) => x.id === params.caseId);
    if (!c) throw new GameError('Caisse inconnue.');
    const it = nextOpen(p, c, rng);
    return out({ hint: encodeHint({ n: it.n, ph: it.ph || null, t: it.t, float: it.float, seed: it.seed, st: it.st }), payout: 0 });
  }

  if (game === 'cases' && action === 'sell') {
    const ids = params.all ? p.inventory.map((x) => x.uid) : [String(params.uid)];
    let total = 0;
    p.inventory = p.inventory.filter((x) => {
      if (!ids.includes(x.uid)) return true;
      total += x.value;
      return false;
    });
    if (!total && !params.all) throw new GameError('Objet introuvable.');
    total = money(total);
    p.balance = money(p.balance + total);
    return out({ sold: ids.length, payout: total });
  }

  throw new GameError('Action inconnue.');
}

function finishBJ(p, bet, out) {
  const s = p.bj;
  const v = bj.view(s);
  if (s.phase !== 'done') return out({ hand: v, bet, payout: 0 });
  const payout = s.payout;
  const stake = s.hands.reduce((t, h) => t + h.bet, 0);
  p.balance = money(p.balance + payout);
  return out({ hand: v, bet, payout }, { game: 'blackjack', bet: money(stake), payout, result: s.hands.map((h) => h.result).join('/') });
}

export function rpsOutcome(a, b) { return a === b ? 'draw' : (a - b + 3) % 3 === 1 ? 'win' : 'lose'; }

// Fin du vol : retrait auto atteint, explosion, ou retrait à la main (manual). null = la fusée vole encore.
function crashSettle(p, now, manual) {
  const c = p.crash;
  const end = c.at + crash.timeTo(c.point);
  const autoT = c.auto && c.auto <= c.point ? c.at + crash.timeTo(c.auto) : Infinity;
  let m;
  if (autoT <= now) m = c.auto;
  else if (now >= end) m = null;
  else if (manual) { const cur = crash.mult(now - c.at); m = cur < c.point ? cur : null; }
  else return null;
  const payout = m ? money(c.bet * m) : 0;
  p.balance = money(p.balance + payout);
  p.crash = null;
  return { point: c.point, mult: m, payout, bet: c.bet };
}
