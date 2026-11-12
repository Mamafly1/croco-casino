// Page roulette : en solo la bille part quand tu cliques ; en ligne, tout le monde mise sur le même tour.
import { casino, mountShell, $, eur, nf2, reduceMotion, sfx, lockBet } from '../core.js';
import { mountFeed, sessionStats } from '../widgets.js';
import { chipSVG, CHIP_VALUES } from '../symbols.js';
import { WHEEL, color, returnFor } from '../engine/roulette.js';
import { money } from '../engine/games.js';

mountShell('roulette');
mountFeed($('feed'), { game: 'roulette', limit: 6 });
const stats = sessionStats((x) => '×' + nf2.format(x));

let chip = 1, bets = {}, history = [], spinning = false;
const online = casino.online;

// ---------- roue ----------
const A = 360 / 37, CX = 150, CY = 150;
let wheelRot = 0, ballAngle = 0;
function polar(r, deg) { const a = (deg - 90) * Math.PI / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; }
function buildWheel() {
  let s = `<circle cx="150" cy="150" r="148" fill="#3a2a12"/><circle cx="150" cy="150" r="140" fill="#b07a00"/><circle cx="150" cy="150" r="134" fill="#181818"/>`;
  s += '<g id="wheelG">';
  WHEEL.forEach((n, i) => {
    const a0 = i * A - A / 2, a1 = i * A + A / 2;
    const [x0, y0] = polar(132, a0), [x1, y1] = polar(132, a1), [x2, y2] = polar(92, a1), [x3, y3] = polar(92, a0);
    const fill = color(n) === 'red' ? '#de0607' : color(n) === 'black' ? '#1d1d1d' : '#1b7a43';
    s += `<path d="M${x0} ${y0}A132 132 0 0 1 ${x1} ${y1}L${x2} ${y2}A92 92 0 0 0 ${x3} ${y3}z" fill="${fill}" stroke="#ffbf17" stroke-width=".8"/>`;
    const [tx, ty] = polar(118, i * A);
    s += `<text x="${tx}" y="${ty}" transform="rotate(${i * A} ${tx} ${ty})" text-anchor="middle" dominant-baseline="central" font-family="DM Sans, Arial" font-weight="800" font-size="10" fill="#f0f0e6">${n}</text>`;
  });
  s += `<circle cx="150" cy="150" r="92" fill="#2c2c2c" stroke="#ffbf17" stroke-width="2"/><circle cx="150" cy="150" r="70" fill="#3a2a12"/>`;
  for (let k = 0; k < 4; k++) s += `<rect x="146" y="88" width="8" height="62" rx="4" fill="#ffbf17" transform="rotate(${k * 90} 150 150)"/>`;
  s += `<circle cx="150" cy="150" r="14" fill="#ffbf17"/><circle cx="150" cy="150" r="6" fill="#b07a00"/></g>`;
  s += `<path d="M150 4l-7 12h14z" fill="#f0f0e6"/>`; // repère
  s += `<circle id="ball" r="6" fill="#f0f0e6" stroke="#888" stroke-width="1"/>`;
  $('wheel').innerHTML = s;
  draw(0, 0, 140);
}
function draw(rot, ball, r) {
  $('wheelG').setAttribute('transform', `rotate(${rot} 150 150)`);
  const [bx, by] = polar(r, ball);
  $('ball').setAttribute('cx', bx); $('ball').setAttribute('cy', by);
}
// Bille : elle tourne sur le bord, ralentit, tombe, puis saute de case en case
// (avance, revient, repart) avant de se poser. Le numéro tiré ne change pas : seule l'animation est libre.
const HOPS = [[2, 0, 1, 0], [3, 1, 2, 0], [3, 1, -1, 0], [4, 2, 0, -1, 0], [3, 2, 0, 1, 0], [2, 1, -1, 0], [4, 1, 2, 0], [1, -1, 0, 1, 0]];
const hermite = (p0, p1, m0, m1, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};
function spinTo(n, ms = 7500) {
  return new Promise((resolve) => {
    // La bille se pose n'importe où dans sa case (pas pile au centre), et la roue s'arrête où elle veut
    const idx = WHEEL.indexOf(n), off = (Math.random() * 2 - 1) * 0.3 * A, target = idx * A + off;
    const rEnd = 108 + Math.random() * 8, rest = (Math.random() * 2 - 1) * 70;
    const startRot = wheelRot, dRot = 360 + ((rest - target - startRot) % 360 + 360) % 360;
    const done = () => { wheelRot = (startRot + dRot) % 360; ballAngle = wheelRot + target; draw(wheelRot, ballAngle, rEnd); resolve(); };
    if (reduceMotion) { done(); return; }
    const rot = (t) => startRot + dRot * (1 - (1 - t) * (1 - t)); // la roue ralentit jusqu'à l'arrêt
    const rotV = (t) => 2 * dRot * (1 - t);
    const seq = HOPS[Math.floor(Math.random() * HOPS.length)];
    // découpage du temps : bord, sauts, pose
    const TC = 0.5, TS = 0.9;
    // phase 1 : vitesse de la bille (écran) de -V0 à -V1 ; on ajuste V0 pour tomber pile sur la case seq[0]
    const V1 = 0.25 * rotV(TC);
    const want = target + seq[0] * A + rot(TC); // angle écran voulu au moment de la chute
    let D = -(4.5 * 360);
    D -= (((ballAngle + D - want) % 360) + 360) % 360;
    const V0 = -2 * D / TC - V1;
    const ballP1 = (t) => ballAngle - V0 * t + (V0 - V1) * t * t / (2 * TC);
    // phase 2 : sauts (durées décroissantes, petites pauses dans les cases)
    const segs = [];
    let w = 0;
    for (let i = 1; i < seq.length; i++) {
      const hop = 1.25 - i * 0.12, dwell = i === seq.length - 1 ? 0 : (i === seq.length - 2 ? 0.9 : 0.35 + Math.random() * 0.3);
      segs.push({ from: seq[i - 1], to: seq[i], hop, dwell, i }); w += hop + dwell;
    }
    let tt = TC;
    for (const g of segs) { g.t0 = tt; g.t1 = tt + g.hop / w * (TS - TC); g.t2 = g.t1 + g.dwell / w * (TS - TC); tt = g.t2; }
    const vIn = -V1 - rotV(TC); // vitesse relative à la roue au moment de la chute
    const t0 = performance.now();
    const ev = { seg: -1, fall: false, hop: 0, settle: false };
    sfx.play('diceThrow', { vol: 0.9 }); // la bille est lancée
    (function step(now) {
      const t = Math.min(1, (now - t0) / ms), R = rot(t);
      let ball, r;
      if (t < TC) {
        ball = ballP1(t);
        const f = t / TC;
        r = f < 0.7 ? 140 : 140 - 16 * Math.pow((f - 0.7) / 0.3, 1.6);
        if (f > 0.82 && f < 0.9) r += Math.sin((f - 0.82) / 0.08 * Math.PI) * 4; // choc sur un losange
      } else if (t < TS) {
        const g = segs.find((x) => t < x.t2) || segs[segs.length - 1];
        let rel;
        if (t < g.t1) {
          const u = (t - g.t0) / (g.t1 - g.t0), span = (g.to - g.from) * A, d = g.t1 - g.t0;
          const m0 = g.i === 1 ? Math.max(vIn * d, span * 2 - A) : span * 1.3, m1 = span * 0.4;
          rel = target + hermite(g.from * A, g.to * A, m0, m1, u);
          const h = 9 / g.i;
          r = (g.i === 1 ? 124 - (124 - rEnd) * u : rEnd) + Math.sin(u * Math.PI) * h;
        } else {
          // la bille tape le bord de la case et oscille un peu avant de repartir
          const u = (t - g.t1) / Math.max(1e-6, g.t2 - g.t1);
          rel = target + g.to * A + Math.sign(g.to - g.from) * A * 0.22 * Math.sin(u * Math.PI * 2.5) * (1 - u);
          r = rEnd;
        }
        ball = R + rel;
      } else {
        const u = (t - TS) / (1 - TS), last = segs[segs.length - 1];
        ball = R + target + Math.sign(last.to - last.from) * A * 0.25 * Math.sin(u * Math.PI * 2) * (1 - u) * (1 - u);
        r = rEnd;
      }
      // sons : cliquetis sur le bord, chute, chaque saut de case en case, pose
      if (t < TC) { const s = Math.floor(ball / 45); if (s !== ev.seg) { ev.seg = s; sfx.play('click', { vol: 1, gap: 35 }); } }
      else {
        if (!ev.fall) { ev.fall = true; sfx.play('chipHit', { vol: 1 }); }
        while (ev.hop < segs.length && t >= segs[ev.hop].t1) { sfx.play('chipHit', { vol: Math.max(0.3, 0.9 - ev.hop * 0.15), rate: 1 + ev.hop * 0.04 }); ev.hop++; }
        if (!ev.settle && t >= TS) { ev.settle = true; sfx.play('chipLay', { vol: 0.8 }); }
      }
      draw(R, ball, r);
      if (t < 1) requestAnimationFrame(step); else done();
    })(t0);
  });
}

// ---------- tapis ----------
function buildTable() {
  let h = '<button class="zero n" data-k="n:0" aria-label="Zéro">0</button>';
  for (let row = 0; row < 3; row++) {
    for (let c = 0; c < 12; c++) {
      const n = c * 3 + (3 - row);
      h += `<button class="n c-${color(n)}" style="grid-row:${row + 1};grid-column:${c + 2}" data-k="n:${n}" aria-label="Numéro ${n}">${n}</button>`;
    }
    h += `<button style="grid-row:${row + 1};grid-column:14" data-k="col:${3 - row}" aria-label="Colonne ${3 - row}">2:1</button>`;
  }
  ['1-12', '13-24', '25-36'].forEach((t, i) => { h += `<button style="grid-row:4;grid-column:${2 + i * 4} / span 4" data-k="dozen:${i + 1}">${t}</button>`; });
  [['low', '1-18'], ['even', 'PAIR'], ['red', 'ROUGE'], ['black', 'NOIR'], ['odd', 'IMPAIR'], ['high', '19-36']].forEach(([k, t], i) => {
    const bg = k === 'red' ? 'background:var(--red);' : k === 'black' ? 'background:#181818;' : '';
    h += `<button style="grid-row:5;grid-column:${2 + i * 2} / span 2;${bg}" data-k="${k}">${t}</button>`;
  });
  $('tbl').innerHTML = h;
}
const stack = [];
function renderBets() {
  document.querySelectorAll('#tbl button').forEach((b) => {
    const k = b.dataset.k, v = bets[k];
    let c = b.querySelector('.chipon');
    if (!v) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('span'); c.className = 'chipon'; b.appendChild(c); }
    c.innerHTML = chipSVG(v, v >= 100 ? nf2.format(v).replace(/,00$/, '') : String(v).replace('.', ','));
  });
  $('total').textContent = eur(totalBet());
  label();
}
const totalBet = () => money(Object.values(bets).reduce((s, v) => s + v, 0));
function addBet(k, amount) {
  bets[k] = money((bets[k] || 0) + amount);
  stack.push([k, amount]);
  renderBets();
}
function removeOne(k) {
  if (!bets[k]) return;
  bets[k] = money(bets[k] - Math.min(bets[k], chip));
  if (bets[k] < 0.1) delete bets[k];
  renderBets();
}
$('tbl').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || spinning) return;
  sfx.play('chipLay');
  addBet(b.dataset.k, chip);
});
$('tbl').addEventListener('contextmenu', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault(); if (!spinning) removeOne(b.dataset.k);
});
let pressT = 0;
$('tbl').addEventListener('touchstart', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  pressT = setTimeout(() => { pressT = -1; removeOne(b.dataset.k); }, 500);
}, { passive: true });
$('tbl').addEventListener('touchend', (e) => { if (pressT === -1) e.preventDefault(); clearTimeout(pressT); pressT = 0; });
$('tbl').addEventListener('mouseover', (e) => {
  const b = e.target.closest('button');
  document.querySelectorAll('#tbl .hl').forEach((x) => x.classList.remove('hl'));
  if (!b) return;
  const k = b.dataset.k;
  if (k.startsWith('n:')) return;
  for (let n = 1; n <= 36; n++) if (returnFor(k, n)) { const x = document.querySelector(`#tbl [data-k="n:${n}"]`); if (x) x.classList.add('hl'); }
});
$('tbl').addEventListener('mouseleave', () => document.querySelectorAll('#tbl .hl').forEach((x) => x.classList.remove('hl')));

$('chipset').innerHTML = CHIP_VALUES.map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === chip}" aria-label="Jeton de ${String(v).replace('.', ',')} €">${chipSVG(v)}</button>`).join('');
$('chipset').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  chip = +b.dataset.v;
  document.querySelectorAll('#chipset button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
$('undo').addEventListener('click', () => {
  const last = stack.pop(); if (!last) return;
  const [k, a] = last;
  bets[k] = money((bets[k] || 0) - a);
  if (bets[k] < 0.1) delete bets[k];
  renderBets();
});
$('clear').addEventListener('click', () => { bets = {}; stack.length = 0; renderBets(); });
// ×2 double seulement les jetons posés (avant, sans jeton, il remettait en douce les mises du tour d'avant)
$('dbl').addEventListener('click', () => {
  if (!Object.keys(bets).length) { $('msg').textContent = 'Pose d’abord un jeton sur le tapis.'; return; }
  for (const k of Object.keys(bets)) { stack.push([k, bets[k]]); bets[k] = money(bets[k] * 2); }
  renderBets();
});

// ---------- résultat ----------
function showResult(n, payout, staked) {
  const c = color(n);
  const name = n === 0 ? 'Zéro' : `${n} ${c === 'red' ? 'rouge' : 'noir'}`;
  let line = '';
  if (staked > 0) line = payout > 0 ? `<span class="pos">Gagné ${eur(payout)}</span>` : '<span class="neg">Perdu</span>';
  $('bigres').innerHTML = `<span class="ball-n c-${c}">${n}</span><p>${name}<br>${line}</p>`;
  document.querySelectorAll('#tbl .hl').forEach((x) => x.classList.remove('hl'));
  const cell = document.querySelector(`#tbl [data-k="n:${n}"]`);
  if (cell) cell.classList.add('hl');
}
function drawHistory(list) {
  $('history').innerHTML = list.slice(0, 12).map((n) => `<span class="c-${color(n)}">${n}</span>`).join('');
}

function label() {
  const p = $('play');
  lockBet(spinning || (online && casino.round && casino.round.phase === 'spun')); // la bille roule : plus de jetons à poser
  if (!online) { p.textContent = 'Lancer la bille'; p.disabled = spinning; return; }
  const r = casino.round;
  p.disabled = spinning || (r && r.phase === 'spun') || casino.status !== 'online';
  p.textContent = r && r.phase === 'betting' ? `Miser ${eur(totalBet())} dans ce tour` : `Miser ${eur(totalBet())} et lancer un tour`;
}

// ---------- solo ----------
async function soloSpin() {
  if (spinning) return;
  if (!totalBet()) { $('msg').textContent = 'Pose au moins un jeton sur le tapis.'; return; }
  spinning = true; label();
  try {
    const res = await casino.play('roulette', 'spin', { bets });
    seenHint();
    $('msg').textContent = '';
    $('bigres').innerHTML = '';
    await spinTo(res.n);
    casino.reveal(res.payout);
    stats.add(res.bet, res.payout, res.payout / res.bet);
    history.unshift(res.n); drawHistory(history);
    showResult(res.n, res.payout, res.bet);
  } catch (err) {
    $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
  } finally {
    spinning = false; label();
  }
}

// ---------- en ligne ----------
let myStake = 0, lastRoundId = -1, lastPhase = '', timer = 0;
async function onlineBet() {
  if (!totalBet()) { $('msg').textContent = 'Pose au moins un jeton sur le tapis.'; return; }
  try {
    const res = await casino.play('roulette', 'bet', { bets });
    seenHint();
    casino.reveal(0);
    myStake = money(myStake + res.bet);
    bets = {}; stack.length = 0; renderBets();
    $('msg').className = 'msg ok';
    $('msg').textContent = `Mise acceptée : ${eur(res.bet)}. Tes jetons sont dans le tour.`;
  } catch (err) {
    $('msg').className = 'msg';
    $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
  }
}
// ---------- mises des autres joueurs (en ligne) ----------
// Chaque joueur a sa couleur ; ses jetons apparaissent en petit sur les cases où il a misé.
const PCOLORS = ['#3f8cff', '#ff5fb4', '#3ddc5f', '#b07aff', '#ff8a3d', '#22d3ee', '#f0f0e6', '#ffd23f'];
// Couleur par joueur, dans l'ordre d'arrivée du tour : deux joueurs du même tour n'ont jamais la même
let colorOf = {};
function assignColors(r) {
  colorOf = {};
  let i = 0;
  for (const p of (r && r.players) || []) if (p.name !== casino.me.name) colorOf[p.name] = PCOLORS[i++ % PCOLORS.length];
}
const pcolor = (name) => colorOf[name] || PCOLORS[0];
const escN = (n) => String(n).replace(/[<>&"]/g, '');
function keyLabel(k) {
  const [kind, a] = k.split(':');
  return { n: a, red: 'Rouge', black: 'Noir', odd: 'Impair', even: 'Pair', low: '1-18', high: '19-36',
    dozen: ['1-12', '13-24', '25-36'][a - 1], col: `Colonne ${a}` }[kind] || k;
}
function renderTableBets(r) {
  document.querySelectorAll('#tbl .pl-bets').forEach((x) => x.remove());
  const players = (r && r.phase !== 'idle' && r.players) || [];
  const byKey = {};
  for (const p of players) for (const [k, v] of Object.entries(p.bets || {})) (byKey[k] = byKey[k] || []).push({ name: p.name, v, me: p.name === casino.me.name });
  for (const [k, list] of Object.entries(byKey)) {
    const cell = document.querySelector(`#tbl [data-k="${k}"]`);
    if (!cell) continue;
    list.sort((a, b) => b.me - a.me || b.v - a.v);
    const span = document.createElement('span');
    span.className = 'pl-bets';
    span.title = list.map((x) => `${x.me ? 'Toi' : x.name} ${eur(x.v)}`).join(', ');
    span.innerHTML = list.slice(0, 3).map((x) => `<i class="${x.me ? 'me' : ''}" style="--pc:${x.me ? 'var(--gold)' : pcolor(x.name)}">${x.me ? '★' : escN(x.name[0]).toUpperCase()}</i>`).join('')
      + (list.length > 3 ? `<i class="more">+${list.length - 3}</i>` : '');
    cell.appendChild(span);
  }
}
// hide = true pendant que la bille tourne : les gains ne s'affichent qu'une fois le numéro tombé (sinon ça spoile)
function renderPlayers(r, hide = false) {
  const list = (r && r.players) || [];
  $('playersBox').hidden = !list.length;
  $('players').innerHTML = list.map((p) => {
    const me = p.name === casino.me.name;
    const where = Object.entries(p.bets || {}).map(([k, v]) => `${keyLabel(k)} ${eur(v)}`).join(' · ');
    return `<li><span class="pl-who"><i class="pl-dot" style="--pc:${me ? 'var(--gold)' : pcolor(p.name)}"></i><b>${me ? 'Toi' : escN(p.name)}</b><small>${escN(where)}</small></span>`
      + `<span class="num">${eur(p.total)}${p.payout != null && !hide ? ` → <span class="${p.payout > 0 ? 'pos' : 'neg'}">${eur(p.payout)}</span>` : ''}</span></li>`;
  }).join('');
}
async function onRound(r) {
  if (!r) return;
  const fresh = r.phase === 'spun' && !(r.id === lastRoundId && lastPhase === 'spun'); // la bille va tourner
  assignColors(r);
  renderPlayers(r, fresh);
  renderTableBets(r);
  drawHistory(fresh ? (r.history || []).slice(1) : r.history || []); // le nouveau numéro n'arrive qu'à la fin
  if (r.id !== lastRoundId && r.phase === 'betting') { myStake = 0; }
  const mine = (r.players || []).find((p) => p.name === casino.me.name);
  if (mine) myStake = mine.total;
  clearInterval(timer);
  // nouveau tour : le numéro sorti au tour d'avant n'est plus encadré sur le tapis (on dirait sinon une mise posée dessus)
  if (r.phase !== 'spun') document.querySelectorAll('#tbl .hl').forEach((x) => x.classList.remove('hl'));
  if (r.phase === 'betting') {
    $('phase').textContent = 'MISES OUVERTES';
    $('barBox').hidden = false;
    const total = 15000;
    const tick = () => {
      const left = Math.max(0, r.endsAt - Date.now());
      $('bar').style.width = (left / total * 100) + '%';
      $('phase').textContent = `MISES OUVERTES · ${Math.ceil(left / 1000)} s`;
    };
    tick(); timer = setInterval(tick, 200);
  } else if (r.phase === 'spun' && !(r.id === lastRoundId && lastPhase === 'spun')) {
    $('phase').textContent = 'ROULETTE';
    $('barBox').hidden = true;
    const payout = mine ? mine.payout || 0 : 0;
    if (mine) casino.hold(payout);
    spinning = true; label();
    $('bigres').innerHTML = '';
    await spinTo(r.n, Math.max(2000, Math.min(7500, r.endsAt - Date.now() - 2000)));
    spinning = false;
    renderPlayers(r);
    drawHistory(r.history || []);
    if (mine) { casino.reveal(payout); stats.add(mine.total, payout, payout / mine.total); }
    showResult(r.n, payout, mine ? mine.total : 0);
    $('phase').textContent = 'RÉSULTAT';
    $('msg').textContent = '';
    label();
  } else if (r.phase === 'idle') {
    $('phase').textContent = 'EN ATTENTE';
    $('barBox').hidden = true;
    if (!spinning) $('msg').textContent = '';
  }
  lastRoundId = r.id; lastPhase = r.phase;
  label();
}

$('play').addEventListener('click', () => (online ? onlineBet() : soloSpin()));
// l'aide « Clique sur le tapis… » ne s'affiche que tant qu'on n'a jamais misé
const HINT_KEY = 'croco-roulette-aide';
const seenHint = () => { try { localStorage.setItem(HINT_KEY, '1'); } catch {} $('tapHint').hidden = true; };
try { if (localStorage.getItem(HINT_KEY)) $('tapHint').hidden = true; } catch {}
$('histBtn').addEventListener('click', (e) => {
  const open = e.currentTarget.closest('.status').classList.toggle('show-hist');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
if (online) {
  casino.on('round', onRound).on('status', label);
  $('play').textContent = 'Miser';
} else {
  $('phase').textContent = 'ROULETTE · SOLO';
}
buildWheel();
buildTable();
renderBets();
