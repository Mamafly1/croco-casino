// Blackjack : 6 jeux mélangés à chaque manche, le croupier tire jusqu'à 17 et reste sur 17 souple,
// blackjack payé 3 pour 2, doubler sur deux cartes, une seule séparation. Pas d'assurance.
const RANKS = 'A23456789TJQK';
const SUITS = 'shdc';

export function newShoe(rng, decks = 6) {
  const s = [];
  for (let d = 0; d < decks; d++) for (const r of RANKS) for (const u of SUITS) s.push(r + u);
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

export function cardValue(c) {
  const r = c[0];
  return r === 'A' ? 11 : 'TJQK'.includes(r) ? 10 : +r;
}

export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += cardValue(c); if (c[0] === 'A') aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}

const isBJ = (cards) => cards.length === 2 && total(cards).t === 21;

export function deal(bet, rng) {
  const shoe = newShoe(rng);
  const s = {
    shoe,
    dealer: [shoe.pop(), shoe.pop()],
    hands: [{ cards: [shoe.pop(), shoe.pop()], bet, done: false, doubled: false, split: false }],
    active: 0,
    phase: 'player',
  };
  // Le croupier regarde sa carte cachée s'il montre un As ou une figure
  if (isBJ(s.hands[0].cards) || isBJ(s.dealer)) finish(s);
  return s;
}

export function canAct(s, action) {
  if (s.phase !== 'player') return false;
  const h = s.hands[s.active];
  if (!h || h.done) return false;
  if (action === 'hit' || action === 'stand') return true;
  if (action === 'double') return h.cards.length === 2;
  if (action === 'split') return s.hands.length === 1 && h.cards.length === 2 && cardValue(h.cards[0]) === cardValue(h.cards[1]);
  return false;
}

// Mise supplémentaire demandée par l'action (doubler / séparer)
export function extraCost(s, action) {
  return action === 'double' || action === 'split' ? s.hands[s.active].bet : 0;
}

export function act(s, action) {
  if (!canAct(s, action)) throw new Error('Action impossible');
  const h = s.hands[s.active];
  if (action === 'hit') {
    h.cards.push(s.shoe.pop());
    if (total(h.cards).t >= 21) h.done = true;
  } else if (action === 'stand') {
    h.done = true;
  } else if (action === 'double') {
    h.bet *= 2; h.doubled = true;
    h.cards.push(s.shoe.pop());
    h.done = true;
  } else if (action === 'split') {
    const second = { cards: [h.cards.pop(), s.shoe.pop()], bet: h.bet, done: false, doubled: false, split: true };
    h.cards.push(s.shoe.pop());
    h.split = true;
    s.hands.push(second);
    if (h.cards[0][0] === 'A') { h.done = true; second.done = true; } // As séparés : une carte chacun
    for (const x of s.hands) if (total(x.cards).t === 21) x.done = true;
  }
  while (s.active < s.hands.length && s.hands[s.active].done) s.active++;
  if (s.active >= s.hands.length) finish(s);
  return s;
}

function finish(s) {
  const allBust = s.hands.every((h) => total(h.cards).t > 21);
  const playerBJ = s.hands.length === 1 && !s.hands[0].split && isBJ(s.hands[0].cards);
  if (!allBust && !playerBJ) {
    while (total(s.dealer).t < 17) s.dealer.push(s.shoe.pop());
  }
  const d = total(s.dealer).t, dBJ = isBJ(s.dealer);
  let payout = 0;
  for (const h of s.hands) {
    const p = total(h.cards).t, bj = !h.split && isBJ(h.cards);
    let ret, res;
    if (p > 21) { ret = 0; res = 'bust'; }
    else if (bj && !dBJ) { ret = 2.5; res = 'blackjack'; }
    else if (dBJ && !bj) { ret = 0; res = 'lose'; }
    else if (bj && dBJ) { ret = 1; res = 'push'; }
    else if (d > 21 || p > d) { ret = 2; res = 'win'; }
    else if (p === d) { ret = 1; res = 'push'; }
    else { ret = 0; res = 'lose'; }
    h.result = res;
    h.payout = Math.round(h.bet * ret * 100) / 100;
    payout += h.payout;
  }
  s.payout = Math.round(payout * 100) / 100;
  s.phase = 'done';
  s.active = -1;
}

// Vue envoyée au joueur : jamais le sabot, et la carte cachée du croupier tant que la main n'est pas finie.
export function view(s) {
  if (!s) return null;
  return {
    dealer: s.phase === 'done' ? s.dealer : [s.dealer[0], '??'],
    dealerTotal: s.phase === 'done' ? total(s.dealer).t : total([s.dealer[0]]).t,
    hands: s.hands.map((h) => ({ cards: h.cards, bet: h.bet, total: total(h.cards).t, soft: total(h.cards).soft, done: h.done, result: h.result, payout: h.payout })),
    active: s.active,
    phase: s.phase,
    payout: s.payout,
    can: ['hit', 'stand', 'double', 'split'].filter((a) => canAct(s, a)),
  };
}
