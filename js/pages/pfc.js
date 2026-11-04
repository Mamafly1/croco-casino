// Page pierre-feuille-ciseaux : contre le croco (tout de suite) ou en duel contre un autre joueur.
import { casino, mountShell, $, eur, esc, toast, reduceMotion } from '../core.js';
import { mountFeed, betControl, sessionStats } from '../widgets.js';
import { RPS_MOVES, RPS_MULT } from '../engine/games.js';

mountShell('rps');
mountFeed($('feed'), { game: 'rps', limit: 8 });
const bet = betControl();
const stats = sessionStats();

// mains en pixel art (9×9)
const ART = {
  pierre: ['.........', '..wwwww..', '.wwwwwww.', 'wwwwwwwww', 'wwwwwwwww', 'wwwwwwww.', '.wwwwww..', '..wwww...', '.........'],
  feuille: ['.w.w.w...', '.w.w.w.w.', '.w.w.w.w.', '.wwwwwww.', 'wwwwwwww.', 'wwwwwwww.', '.wwwwww..', '..wwww...', '..wwww...'],
  ciseaux: ['.w...w...', '.ww..w...', '..w.w....', '..www....', '.wwwwww..', 'wwwwwwww.', '.wwwwww..', '..wwww...', '..wwww...'],
  vide: ['.........', '.........', '...ggg...', '..g...g..', '.....g...', '....g....', '....g....', '.........', '....g....'],
};
const hand = (m) => `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">${ART[m].map((row, y) => [...row].map((c, x) => (c === '.' ? '' : `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c === 'g' ? '#ffbf17' : '#f0d9b5'}"/>`)).join('')).join('')}</svg>`;
const NAME = { pierre: 'Pierre', feuille: 'Feuille', ciseaux: 'Ciseaux' };

$('oddsNote').innerHTML = `Contre le croco : il joue au hasard. Gagné, tu reçois <strong>×${String(RPS_MULT).replace('.', ',')}</strong> ; égalité, ta mise est rendue ; perdu, tu perds la mise. Retour moyen 99 %.<br>` +
  'Contre un joueur : partie en 3 points, chacun mise la même somme et le gagnant prend tout (×2). À chaque manche, vous choisissez vos coups en secret ; égalité = on rejoue. 30 s par manche, sinon le point est perdu. Les défis non acceptés sont remboursés après 30 min.';

let mode = 'bot', move = 'pierre', busy = false;
function renderMoves() {
  $('moves').innerHTML = RPS_MOVES.map((m) => `<button type="button" data-m="${m}" aria-pressed="${mode === 'duel' && m === move}">${hand(m)}${NAME[m]}</button>`).join('');
}
renderMoves();
$('handMe').innerHTML = hand('pierre'); $('handOther').innerHTML = hand('pierre');

async function show(mine, other, outcome, payout, b, vs) {
  $('nameOther').textContent = vs || 'Le croco';
  $('result').textContent = 'CHI… FOU… MI !';
  $('handMe').innerHTML = hand('pierre'); $('handOther').innerHTML = hand('pierre');
  if (!reduceMotion) {
    $('handMe').classList.add('shake'); $('handOther').classList.add('shake');
    await new Promise((r) => setTimeout(r, 1000));
    $('handMe').classList.remove('shake'); $('handOther').classList.remove('shake');
  }
  $('handMe').innerHTML = hand(mine); $('handOther').innerHTML = hand(other);
  $('result').textContent = outcome === 'win' ? `GAGNÉ ! +${eur(payout - b)}` : outcome === 'draw' ? 'ÉGALITÉ : MISE RENDUE' : `PERDU : −${eur(b)}`;
  $('result').style.color = outcome === 'win' ? 'var(--gold)' : outcome === 'lose' ? 'var(--lose)' : 'var(--ink)';
  stats.add(b, payout, outcome === 'win' ? payout / b : 0);
}

$('moves').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-m]'); if (!btn || busy) return;
  move = btn.dataset.m;
  if (mode === 'duel') { renderMoves(); return; }
  busy = true; $('msg').textContent = '';
  try {
    const b = bet.get();
    const r = await casino.play('rps', 'bot', { bet: b, move });
    await show(r.move, r.other, r.outcome, r.payout, b, 'Le croco');
    casino.reveal(r.payout);
  } catch (err) {
    $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
  } finally { busy = false; }
});

// ---------- défis entre joueurs : partie en 3 points ----------
function setMode(m) {
  mode = m;
  $('tabBot').setAttribute('aria-pressed', String(m === 'bot'));
  $('tabDuel').setAttribute('aria-pressed', String(m === 'duel'));
  $('toBox').hidden = m !== 'duel'; $('play').hidden = m !== 'duel';
  $('moveField').hidden = m === 'duel'; // entre joueurs, on choisit son coup à chaque manche, pas au moment du défi
  if (m === 'duel') fillPlayers();
}
$('tabBot').addEventListener('click', () => setMode('bot'));
$('tabDuel').addEventListener('click', () => {
  if (!casino.online) { $('msg').textContent = 'Les défis se jouent en ligne.'; return; }
  setMode('duel');
});
async function fillPlayers() {
  try {
    const list = await casino.players();
    $('to').innerHTML = '<option value="">N’importe qui (défi ouvert)</option>' + list.filter((p) => p.name !== casino.me.name).map((p) => `<option value="${esc(p.name)}">${p.online ? '● ' : ''}${esc(p.name)}${p.online ? ' (en ligne)' : ''}</option>`).join('');
  } catch {}
}
$('play').addEventListener('click', async () => {
  $('msg').textContent = '';
  try {
    const b = bet.get();
    await casino.play('rps', 'duel', { bet: b, to: $('to').value || null });
    casino.reveal(0);
    toast(`Défi lancé (${eur(b)}) : la partie commencera quand il sera accepté`);
  } catch (err) { $('msg').textContent = err.message; }
});
// Les défis restent visibles quel que soit l'onglet (ceux qui te sont adressés en premier)
function renderDuels() {
  $('duelBox').hidden = !casino.online;
  const me = casino.me.name, list = (casino.duels || []).slice().sort((a, b) => (b.to === me) - (a.to === me));
  $('duels').innerHTML = list.length ? list.map((d) => {
    const mine = d.from === me, forOther = d.to && d.to !== me && !mine;
    return `<div class="duel"${d.to === me ? ' style="outline:2px solid var(--gold)"' : ''}><div class="duel-head"><span>${esc(d.from)}${d.to === me ? ' te défie !' : d.to ? ` → ${esc(d.to)}` : ' (défi ouvert)'}</span><span>${eur(d.bet)} · en 3 points</span></div>
      ${mine ? `<button class="btn-ghost" type="button" data-cancel="${d.id}">Annuler mon défi</button>` : forOther ? '<span class="muted small">Défi réservé à quelqu’un d’autre</span>'
      : `<button class="btn-main" type="button" data-acc="${d.id}">Accepter (mise ${eur(d.bet)})</button>`}</div>`;
  }).join('') : '<p class="muted">Aucun défi pour l’instant. Lance le tien avec l’onglet « Défier un joueur ».</p>';
}
$('duels').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-cancel]'), a = e.target.closest('[data-acc]');
  if (busy || (!c && !a)) return;
  busy = true; $('msg').textContent = '';
  try {
    await casino.play('rps', c ? 'cancel' : 'accept', { id: (c || a).dataset[c ? 'cancel' : 'acc'] });
    casino.reveal(0);
  } catch (err) { $('msg').textContent = err.message; }
  finally { busy = false; }
});
casino.on('duels', renderDuels).on('me', renderDuels);
renderDuels();

// La partie en cours : chaque manche, chacun choisit son coup en secret ; le serveur révèle les deux
let match = null, shownRound = 0, counted = null, animating = false;
casino.on('match', (m) => {
  const fresh = !match || match.id !== m.id;
  match = m;
  if (fresh) { shownRound = m.last ? m.last.round : 0; $('result').textContent = ''; $('arena').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (m.last && m.last.round > shownRound) { shownRound = m.last.round; revealRound(m.last); } else renderMatch();
});
async function revealRound(l) {
  animating = true;
  renderMatch();
  $('nameOther').textContent = match.opp;
  $('handMe').innerHTML = hand('pierre'); $('handOther').innerHTML = hand('pierre');
  $('result').style.color = 'var(--ink)';
  $('result').textContent = 'CHI… FOU… MI !';
  if (!reduceMotion) {
    $('handMe').classList.add('shake'); $('handOther').classList.add('shake');
    await new Promise((r) => setTimeout(r, 1000));
    $('handMe').classList.remove('shake'); $('handOther').classList.remove('shake');
  }
  $('handMe').innerHTML = hand(l.mine || 'vide'); $('handOther').innerHTML = hand(l.theirs || 'vide');
  $('result').textContent = l.outcome === 'win' ? (l.timeout ? `${match.opp.toUpperCase()} N’A PAS JOUÉ : POINT POUR TOI` : 'POINT POUR TOI !')
    : l.outcome === 'lose' ? (l.timeout ? 'TU N’AS PAS JOUÉ À TEMPS : POINT PERDU' : `POINT POUR ${match.opp.toUpperCase()}`) : l.mine ? 'ÉGALITÉ : ON REJOUE' : 'PERSONNE N’A JOUÉ';
  $('result').style.color = l.outcome === 'win' ? 'var(--gold)' : l.outcome === 'lose' ? 'var(--lose)' : 'var(--ink)';
  animating = false;
  renderMatch();
}
function renderMatch() {
  const box = $('matchBox');
  if (!match) { box.hidden = true; return; }
  box.hidden = false;
  $('nameOther').textContent = match.opp;
  $('mScore').innerHTML = `<span>Toi</span><b>${match.score[0]}</b><span>–</span><b>${match.score[1]}</b><span>${esc(match.opp)}</span>`;
  if (match.phase === 'done') {
    $('mMoves').innerHTML = '';
    $('mClose').hidden = false;
    const win = match.result === 'win', cancel = match.result === 'cancel';
    $('mStat').textContent = cancel ? 'Partie annulée (personne ne jouait) : mises rendues.' : win ? `Tu gagnes la partie : +${eur(match.bet)} !` : `${match.opp} gagne la partie : −${eur(match.bet)}`;
    $('mStat').style.color = cancel ? 'var(--ink)' : win ? 'var(--gold)' : 'var(--lose)';
    if (counted !== match.id) { counted = match.id; if (!cancel) stats.add(match.bet, win ? match.bet * 2 : 0, win ? 2 : 0); }
    return;
  }
  $('mClose').hidden = true;
  $('mStat').style.color = '';
  const secs = Math.ceil(match.left / 1000);
  $('mStat').innerHTML = `Manche ${match.round} · premier à ${match.target} points<br>` + (match.myMove
    ? `Tu as joué ${NAME[match.myMove]}. ${match.oppChosen ? `${esc(match.opp)} a joué aussi…` : `En attente de ${esc(match.opp)}… (${secs} s)`}`
    : `${match.oppChosen ? `${esc(match.opp)} a déjà joué. ` : ''}Choisis ton coup : ${secs} s`);
  $('mMoves').innerHTML = RPS_MOVES.map((m) => `<button type="button" data-mm="${m}" aria-pressed="${match.myMove === m}"${match.myMove || animating ? ' disabled' : ''}>${hand(m)}${NAME[m]}</button>`).join('');
}
$('mMoves').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mm]');
  if (!b || !match || match.myMove || match.phase !== 'play') return;
  match.myMove = b.dataset.mm;
  renderMatch();
  try { await casino.play('rps', 'move', { mid: match.id, move: b.dataset.mm }); casino.reveal(0); }
  catch (err) { $('msg').textContent = err.message; match.myMove = null; renderMatch(); }
});
$('mClose').addEventListener('click', () => { match = null; renderMatch(); $('result').textContent = ''; $('nameOther').textContent = 'Le croco'; });
// compte à rebours de la manche
setInterval(() => { if (match && match.phase === 'play' && !animating) { match.left = Math.max(0, match.left - 1000); renderMatch(); } }, 1000);
