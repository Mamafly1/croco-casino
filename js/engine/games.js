// Règles communes au mode solo (navigateur) et au serveur multijoueur.
// `p` est le joueur : { balance, deposits, inventory, played, bj }. Les fonctions le modifient.
import * as plinko from './plinko.js';
import * as roulette from './roulette.js';
import * as slots from './slots.js';
import * as bj from './blackjack.js';
import * as cases from './cases.js';

export const GAMES = ['plinko', 'roulette', 'blackjack', 'cases', 'slots'];
export const PACKS = [10, 20, 50, 100];
export const MIN_BET = 0.1;
export const MAX_BET = 1000;
export const MAX_INVENTORY = 300;

export class GameError extends Error {}

export const money = (x) => Math.round(x * 100) / 100;

export function newPlayer() {
  return { balance: 0, deposits: 0, inventory: [], played: {}, bj: null };
}

export function inventoryValue(p) {
  return money(p.inventory.reduce((s, it) => s + it.value, 0));
}

// Score du classement : ce que tu possèdes moins ce que tu as déposé.
export function score(p) {
  return money(p.balance + inventoryValue(p) - p.deposits);
}

export function readBet(p, raw) {
  const bet = money(Number(raw));
  if (!Number.isFinite(bet) || bet < MIN_BET) throw new GameError('Mise minimum 0,10 €.');
  if (bet > MAX_BET) throw new GameError('Mise maximum 1 000 €.');
  if (bet > p.balance + 1e-9) throw new GameError('Solde insuffisant. Fais un dépôt pour jouer.');
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
  if (total > p.balance + 1e-9) throw new GameError('Solde insuffisant. Fais un dépôt pour jouer.');
  return { bets, total };
}

function played(p, game) { p.played[game] = (p.played[game] || 0) + 1; }

function uid(rng) {
  let s = '';
  for (let i = 0; i < 10; i++) s += Math.floor(rng() * 36).toString(36);
  return s;
}

// ctx = { rng, caseList }
export function run(p, game, action, params = {}, ctx) {
  const { rng } = ctx;
  const out = (result, feed) => ({ result: { ...result, balance: p.balance }, feed });

  if (game === 'wallet' && action === 'deposit') {
    const amount = PACKS[params.pack];
    if (!amount) throw new GameError('Montant inconnu.');
    p.balance = money(p.balance + amount);
    p.deposits = money(p.deposits + amount);
    return out({ amount, payout: amount });
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
    readBet(p, cases.CASE_PRICE);
    const it = cases.open(c, rng);
    // La « roue » de l'animation : objets tirés au même hasard, le gagnant à la position 45
    const reel = [];
    for (let i = 0; i < 52; i++) {
      const x = i === 45 ? it : cases.open(c, rng);
      reel.push({ n: x.n, t: x.t, i: x.i });
    }
    const item = { ...it, uid: uid(rng), caseId: c.id, at: Date.now() };
    p.balance = money(p.balance - cases.CASE_PRICE);
    p.inventory.unshift(item);
    played(p, 'cases');
    // L'objet arrive dans l'inventaire : pas de gain en argent immédiat
    return out({ item, reel, bet: cases.CASE_PRICE, payout: 0 }, { game, bet: cases.CASE_PRICE, payout: item.value, item: { n: item.n, t: item.t, wear: item.wear, st: item.st, value: item.value } });
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
