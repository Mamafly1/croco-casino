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
  'Contre un joueur : chacun mise la même somme, le gagnant prend tout (×2), égalité remboursée. Les défis non acceptés sont remboursés après 30 min.';

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

// ---------- duels ----------
function setMode(m) {
  mode = m;
  $('tabBot').setAttribute('aria-pressed', String(m === 'bot'));
  $('tabDuel').setAttribute('aria-pressed', String(m === 'duel'));
  $('toBox').hidden = m !== 'duel'; $('play').hidden = m !== 'duel';
  $('moveLabel').textContent = m === 'duel' ? 'Ton coup (caché jusqu’au duel)' : 'Ton coup : touche pour jouer';
  renderMoves();
  if (m === 'duel') fillPlayers();
}
$('tabBot').addEventListener('click', () => setMode('bot'));
$('tabDuel').addEventListener('click', () => {
  if (!casino.online) { $('msg').textContent = 'Les duels se jouent en ligne.'; return; }
  setMode('duel');
});
async function fillPlayers() {
  try {
    const list = await casino.players();
    $('to').innerHTML = '<option value="">N’importe qui (défi ouvert)</option>' + list.filter((p) => p.name !== casino.me.name).map((p) => `<option value="${esc(p.name)}">${p.online ? '● ' : ''}${esc(p.name)}</option>`).join('');
  } catch {}
}
$('play').addEventListener('click', async () => {
  $('msg').textContent = '';
  try {
    const b = bet.get();
    await casino.play('rps', 'duel', { bet: b, move, to: $('to').value || null });
    casino.reveal(0);
    toast(`Défi lancé (${eur(b)}) : ${NAME[move]}`);
  } catch (err) { $('msg').textContent = err.message; }
});
// Les défis restent visibles quel que soit l'onglet (ceux qui te sont adressés en premier)
function renderDuels() {
  $('duelBox').hidden = !casino.online;
  const me = casino.me.name, list = (casino.duels || []).slice().sort((a, b) => (b.to === me) - (a.to === me));
  $('duels').innerHTML = list.length ? list.map((d) => {
    const mine = d.from === me, forOther = d.to && d.to !== me && !mine;
    return `<div class="duel"${d.to === me ? ' style="outline:2px solid var(--gold)"' : ''}><div class="duel-head"><span>${esc(d.from)}${d.to === me ? ' te défie !' : d.to ? ` → ${esc(d.to)}` : ' (défi ouvert)'}</span><span>${eur(d.bet)}</span></div>
      ${mine ? `<button class="btn-ghost" type="button" data-cancel="${d.id}">Annuler mon défi</button>` : forOther ? '<span class="muted small">Défi réservé à quelqu’un d’autre</span>'
      : `<div class="moves">${RPS_MOVES.map((m) => `<button type="button" data-acc="${d.id}" data-m="${m}">${hand(m)}${NAME[m]}</button>`).join('')}</div>`}</div>`;
  }).join('') : '<p class="muted">Aucun défi pour l’instant. Lance le tien avec l’onglet « Défier un joueur ».</p>';
}
$('duels').addEventListener('click', async (e) => {
  const c = e.target.closest('[data-cancel]'), a = e.target.closest('[data-acc]');
  if (busy || (!c && !a)) return;
  busy = true; $('msg').textContent = '';
  try {
    if (c) { await casino.play('rps', 'cancel', { id: c.dataset.cancel }); casino.reveal(0); }
    else {
      const r = await casino.play('rps', 'accept', { id: a.dataset.acc, move: a.dataset.m });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await show(r.move, r.other, r.outcome, r.payout, r.bet, r.vs);
      casino.reveal(r.payout);
    }
  } catch (err) { $('msg').textContent = err.message; }
  finally { busy = false; }
});
casino.on('duels', renderDuels).on('me', renderDuels);
// quelqu'un a accepté ton défi
casino.on('duelEnd', (r) => {
  toast(`${r.vs} a accepté ton défi : ${r.outcome === 'win' ? 'gagné' : r.outcome === 'lose' ? 'perdu' : 'égalité'}`);
  if (mode === 'duel') show(r.move, r.other, r.outcome, r.payout, r.bet, r.vs);
});
renderDuels();
