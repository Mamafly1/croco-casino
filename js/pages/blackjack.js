// Page blackjack. Le sabot reste caché (sur le serveur en ligne) ; on ne reçoit que les cartes visibles.
import { casino, mountShell, $, eur, esc } from '../core.js';
import { mountFeed, betControl, sessionStats, cardSVG } from '../widgets.js';

mountShell('blackjack');
mountFeed($('feed'), { game: 'blackjack', limit: 6 });
const bet = betControl();
const stats = sessionStats((x) => '+' + eur(x));

const RES = { win: 'Gagné', blackjack: 'Blackjack !', push: 'Égalité', lose: 'Perdu', bust: 'Sauté' };
let shown = { dealer: 0, hands: [] }; // nombre de cartes déjà affichées, pour n'animer que les nouvelles
let busy = false, current = null;

function cardsHTML(cards, already) {
  return cards.map((c, i) => cardSVG(c, i >= already ? 'deal-in' : '')).join('');
}
function render(v, animate = true) {
  current = v;
  if (!v) {
    $('dealer').innerHTML = ''; $('hands').innerHTML = ''; $('dTot').hidden = true;
    shown = { dealer: 0, hands: [] };
    buttons();
    return;
  }
  const dealerKey = v.dealer.join(',');
  const prevDealer = shown.dealerKey === dealerKey ? v.dealer.length : (animate ? Math.min(shown.dealer, v.dealer.filter((c) => c !== '??').length - (v.phase === 'done' && shown.hidden ? 1 : 0)) : v.dealer.length);
  $('dealer').innerHTML = cardsHTML(v.dealer, animate ? prevDealer : 99);
  $('dTot').hidden = false;
  $('dTot').textContent = v.dealerTotal;
  $('hands').innerHTML = v.hands.map((h, i) => `
    <div class="hand${v.phase === 'player' && i === v.active ? ' active' : ''}">
      <div class="cards">${cardsHTML(h.cards, animate ? (shown.hands[i] || 0) : 99)}</div>
      <span class="tot">${h.soft && h.total < 21 ? 'souple ' : ''}${h.total}</span>
      <span class="res ${!h.result || h.result === 'push' ? '' : h.result === 'win' || h.result === 'blackjack' ? 'pos' : 'neg'}">${h.result ? RES[h.result] + (h.payout ? ' · ' + eur(h.payout) : '') : eur(h.bet)}</span>
    </div>`).join('');
  shown = { dealer: v.dealer.length, dealerKey, hidden: v.dealer.includes('??'), hands: v.hands.map((h) => h.cards.length) };
  buttons();
}
function buttons() {
  const v = current, can = v && v.phase === 'player' ? v.can : [];
  $('hit').disabled = busy || !can.includes('hit');
  $('stand').disabled = busy || !can.includes('stand');
  $('dbl').disabled = busy || !can.includes('double');
  $('split').disabled = busy || !can.includes('split');
  $('deal').disabled = busy || (v && v.phase === 'player');
  $('deal').textContent = v && v.phase === 'done' ? 'Nouvelle main' : 'Distribuer';
}

let roundStake = 0;
async function send(action, params) {
  if (busy) return;
  busy = true; buttons();
  try {
    const r = await casino.play('blackjack', action, params);
    $('msg').textContent = '';
    if (action === 'deal') roundStake = r.bet;
    render(r.hand);
    if (r.hand.phase === 'done') {
      const stake = r.hand.hands.reduce((s, h) => s + h.bet, 0);
      setTimeout(() => casino.reveal(r.payout), 450);
      stats.add(stake, r.payout, r.payout - stake);
      roundStake = 0;
    } else {
      casino.reveal(0);
    }
  } catch (err) {
    $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
  } finally {
    busy = false; buttons();
  }
}
$('deal').addEventListener('click', () => { render(null); send('deal', { bet: bet.get() }); });
$('hit').addEventListener('click', () => send('act', { action: 'hit' }));
$('stand').addEventListener('click', () => send('act', { action: 'stand' }));
$('dbl').addEventListener('click', () => send('act', { action: 'double' }));
$('split').addEventListener('click', () => send('act', { action: 'split' }));
document.addEventListener('keydown', (e) => {
  if (!$('shop').hidden || (e.target && e.target.tagName === 'INPUT')) return;
  const k = e.key.toLowerCase();
  const map = { t: 'hit', h: 'hit', r: 'stand', s: 'stand', d: 'dbl', p: 'split' };
  if (map[k] && !$(map[k]).disabled) $(map[k]).click();
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON' && !$('deal').disabled) { e.preventDefault(); $('deal').click(); }
});

// Reprendre une main en cours après un rechargement
let resumed = false;
casino.on('me', (me) => {
  if (resumed || busy) return;
  resumed = true;
  if (me.bj && me.bj.phase === 'player') { render(me.bj, false); $('msg').className = 'msg ok'; $('msg').textContent = 'Main en cours reprise.'; }
});

// Les autres joueurs à la table (en ligne)
function seats(list) {
  const others = (list || []).filter((s) => s.name !== casino.me.name).slice(0, 8);
  $('tableBox').hidden = !others.length;
  $('seats').innerHTML = others.map((s) => {
    const h = s.hand;
    const status = h.phase === 'done' ? h.hands.map((x) => RES[x.result]).join(' / ') : 'joue…';
    const row = (label, cards, total) => `<div class="seat-row"><small>${label}</small><div class="cards">${cards.map((c) => cardSVG(c)).join('')}</div><b class="num">${total}</b></div>`;
    return `<div class="seat"><b>${esc(s.name)}</b>${row('Croupier', h.dealer, h.dealerTotal)}${h.hands.map((x, i) => row(h.hands.length > 1 ? `Main ${i + 1}` : 'Joueur', x.cards, x.total)).join('')}<small>${status}</small></div>`;
  }).join('');
}
casino.on('table', seats);
seats(casino.table);
buttons();
