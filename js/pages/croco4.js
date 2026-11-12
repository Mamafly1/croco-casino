// Page Croco 4 : quatre à la suite en duel. Chaque pion posé coûte la valeur choisie ; le gagnant ramasse la cagnotte.
import { casino, mountShell, $, eur, esc, sfx, lockBet } from '../core.js';
import { mountFeed } from '../widgets.js';
import { COLS, ROWS, C4_MOVE_MS } from '../engine/c4.js';

mountShell('c4');
mountFeed($('feed'), { game: 'c4', limit: 8 });

let st = { invites: [], game: null }, val = 1, deadline = 0, lastKey = '', busy = false;

// ---------- valeur d'un pion ----------
const readVal = () => (val === 'custom' ? Math.round(parseFloat(String($('valIn').value).replace(',', '.')) * 100) / 100 : val);
$('vals').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  val = b.dataset.v === 'custom' ? 'custom' : +b.dataset.v;
  document.querySelectorAll('#vals button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  $('valIn').hidden = val !== 'custom';
  if (val === 'custom') $('valIn').focus();
});

// ---------- joueurs à défier (en ligne seulement) ----------
async function fillPlayers() {
  if (!casino.online) return;
  try {
    const list = (await casino.players()).filter((p) => p.online && p.name !== casino.me.name);
    const cur = $('to').value;
    $('to').innerHTML = list.length ? list.map((p) => `<option${p.name === cur ? ' selected' : ''}>${esc(p.name)}</option>`).join('') : '<option value="">Personne d’autre en ligne</option>';
  } catch {}
}

// ---------- invitations ----------
function renderInvites() {
  const inv = st.invites || [];
  $('invBox').hidden = !inv.length;
  $('invs').innerHTML = inv.map((x) => x.mine
    ? `<div class="inv-row"><span>Envoyée à <b>${esc(x.to)}</b> · ${eur(x.val)} le pion</span><span class="btns"><button class="btn-ghost" type="button" data-cancel="${x.id}">Annuler</button></span></div>`
    : `<div class="inv-row"><span><b>${esc(x.from)}</b> te défie · ${eur(x.val)} le pion</span><span class="btns"><button class="btn-ghost" type="button" data-decline="${x.id}">Refuser</button><button class="btn-main" type="button" data-accept="${x.id}" style="width:auto">Jouer</button></span></div>`).join('');
}
$('invs').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b || busy) return;
  const act = b.dataset.accept ? 'accept' : b.dataset.decline ? 'decline' : 'cancel', id = b.dataset.accept || b.dataset.decline || b.dataset.cancel;
  await send(act, { id });
});

// ---------- plateau ----------
function renderGame() {
  const g = st.game, box = $('c4Game');
  const playing = !!(g && g.phase === 'play');
  lockBet(playing);
  $('play').hidden = playing;
  $('resign').hidden = !playing;
  if (!g) { box.innerHTML = '<p class="c4-empty">Défie un joueur en ligne : choisis la valeur d’un pion, puis touche « Défier ».</p>'; return; }
  const me = g.me, op = 1 - me, myTurn = playing && g.turn === me;
  const win = new Set((g.line || []).map(([c, r]) => c + ':' + r));
  const lastId = g.last ? g.last.join(':') : '';
  const fresh = lastId && lastId !== lastKey; // nouveau pion : on l'anime (une seule fois)
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    const cells = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      const v = g.board[c][r], k = c + ':' + r;
      cells.push(`<span class="c4-cell${v == null ? '' : ' p' + v}${k === lastId && fresh ? ' last' : ''}${win.has(k) ? ' win' : ''}"></span>`);
    }
    cols.push(`<button type="button" class="c4-col" data-c="${c}" aria-label="Colonne ${c + 1}"${!myTurn || g.board[c].length >= ROWS ? ' disabled' : ''}>${cells.join('')}</button>`);
  }
  let status;
  if (playing) status = myTurn ? 'À toi de jouer : touche une colonne' : `${esc(g.names[op])} réfléchit…`;
  else if (g.winner === -1) status = 'Plateau plein : égalité, chacun reprend ses pions';
  else status = g.winner === me ? `Gagné (${esc(g.why)}) : tu ramasses ${eur(g.pot)} !` : `Perdu (${esc(g.why)})`;
  box.innerHTML = `<div class="c4-players">
      <div class="c4-p${playing && g.turn === me ? ' turn' : ''}"><span class="disc p${me}"></span><span><b>Toi</b><small>${eur(g.paid[me])} posés</small></span></div>
      <div class="c4-pot"><small>Cagnotte</small><b>${eur(g.pot)}</b><small>1 pion = ${eur(g.val)}</small></div>
      <div class="c4-p right${playing && g.turn === op ? ' turn' : ''}"><span class="disc p${op}"></span><span><b>${esc(g.names[op])}</b><small>${eur(g.paid[op])} posés</small></span></div>
    </div>
    <p class="c4-status" aria-live="polite">${status}</p>
    ${playing ? '<div class="c4-timer"><i id="c4bar"></i></div>' : ''}
    <div class="c4-board">${cols.join('')}</div>`;
  if (fresh) { lastKey = lastId; sfx.play('chipLay', { vol: 0.9 }); }
  if (g.phase === 'done' && !box.dataset.ended) { box.dataset.ended = g.id; if (g.winner === me) sfx.play('win'); else if (g.winner === op) sfx.play('lose'); }
  if (playing) delete box.dataset.ended;
  deadline = playing ? Date.now() + g.left : 0;
  tickTimer();
}
function tickTimer() {
  const bar = $('c4bar');
  if (!bar || !deadline) return;
  bar.style.width = Math.max(0, Math.min(100, ((deadline - Date.now()) / C4_MOVE_MS) * 100)) + '%';
}
setInterval(tickTimer, 250);
$('c4Game').addEventListener('click', (e) => {
  const b = e.target.closest('.c4-col'); if (!b || b.disabled || busy) return;
  send('drop', { col: +b.dataset.c });
});
$('resign').addEventListener('click', () => { if (confirm('Abandonner ? Ton adversaire ramasse la cagnotte.')) send('resign'); });

// ---------- actions ----------
async function send(action, params = {}) {
  busy = true; $('msg').textContent = '';
  try {
    const r = await casino.play('c4', action, params);
    if (r.c4) { st = r.c4; render(); }
    if (action === 'invite') { $('msg').className = 'msg ok'; $('msg').textContent = `Invitation envoyée à ${params.to}.`; }
  } catch (err) {
    $('msg').className = 'msg'; $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
  } finally { busy = false; }
}
$('play').addEventListener('click', () => {
  const to = $('to').value, v = readVal();
  if (!to) { $('msg').className = 'msg'; $('msg').textContent = 'Personne d’autre n’est en ligne pour l’instant.'; return; }
  if (!(v >= 0.1 && v <= 100)) { $('msg').className = 'msg'; $('msg').textContent = 'Un pion vaut entre 0,10 € et 100 €.'; return; }
  send('invite', { to, val: v });
});

function render() { renderInvites(); renderGame(); $('betMax').textContent = 'solde ' + eur(casino.shownBalance()); }
casino.on('c4', (c) => { if (c) { st = c; render(); } });
casino.on('me', () => { $('betMax').textContent = 'solde ' + eur(casino.shownBalance()); });
casino.on('online', fillPlayers);
const start = async () => { fillPlayers(); try { const r = await casino.play('c4', 'state'); st = r.c4; render(); } catch {} };
if (!casino.online) $('c4Game').innerHTML = '<p class="c4-empty">Le Croco 4 se joue en ligne, contre un autre joueur.</p>';
else if (casino.status === 'online') start(); else casino.on('status', (s) => { if (s === 'online') start(); });
