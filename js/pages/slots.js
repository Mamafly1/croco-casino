// Page machine à sous.
import { casino, mountShell, $, eur, nfx, nf0, reduceMotion, sfx, lockBet } from '../core.js';
import { mountFeed, betControl, sessionStats } from '../widgets.js';
import { symbolSVG, SYMBOL_NAMES } from '../symbols.js';
import { SYMBOLS, COUNTS, PAYS, TWO_CHERRIES, LINES, STRIPS, rtp } from '../engine/slots.js';

mountShell('slots');
sfx.preload('reel');
mountFeed($('feed'), { game: 'slots', limit: 6 });
const bet = betControl();
const stats = sessionStats();

const reels = [...document.querySelectorAll('.reel')];
const strips = reels.map((r) => r.querySelector('.strip'));
const L = 32;
let cell = 0, spinning = false, autoLeft = 0, autoN = 1;
const current = [0, 0, 0]; // case du milieu affichée

function setCell() {
  const w = reels[0].clientWidth;
  cell = Math.round(Math.min(w, matchMedia('(min-width: 1100px)').matches ? 210 : 150) * 0.9); // plus grand sur PC
  $('window').style.setProperty('--cell', cell + 'px');
}
function drawStatic(only = -1) {
  strips.forEach((s, r) => {
    if (only >= 0 && r !== only) return;
    const st = current[r];
    s.style.transition = 'none';
    s.style.transform = 'translateY(0)';
    s.innerHTML = [-1, 0, 1].map((d) => `<div class="cell">${symbolSVG(STRIPS[r][(st + d + L) % L])}</div>`).join('');
  });
}

// ---------- cotes ----------
const pct = (x) => nfx.format(x * 100) + ' %';
(function writeOdds() {
  const p = Object.fromEntries(SYMBOLS.map((s) => [s, COUNTS[s] / L]));
  let hit = 0;
  const rows = SYMBOLS.map((s) => {
    const q = p[s] ** 3;
    hit += q;
    return `<tr><td>${symbolSVG(s, 22)}${symbolSVG(s, 22)}${symbolSVG(s, 22)}</td><td class="r"><b>×${PAYS[s]}</b></td><td class="m">1 sur ${nf0.format(Math.round(1 / q))}</td></tr>`;
  }).join('');
  const q2 = p.cherry * p.cherry * (1 - p.cherry);
  hit += q2;
  $('paytable').innerHTML = `<tbody>${rows}<tr><td>${symbolSVG('cherry', 22)}${symbolSVG('cherry', 22)}<span class="muted small">&nbsp;+ autre</span></td><td class="r"><b>×${TWO_CHERRIES}</b></td><td class="m">1 sur ${nf0.format(Math.round(1 / q2))}</td></tr></tbody>`;
  $('oddsNote').innerHTML = `Chaque rouleau a 32 cases ; il y a ${COUNTS.croco} croco et ${COUNTS.cherry} cerises par rouleau. Les gains sont en multiples de la <strong>mise d’une ligne</strong> (mise totale ÷ 5), de gauche à droite.<br>` +
    `Une ligne gagne <strong>1 fois sur ${nf0.format(Math.round(1 / hit))}</strong>. Sur la durée, la machine garde <strong>${pct(1 - rtp())}</strong> de ce qui est misé (retour ${pct(rtp())}).`;
})();

// ---------- lignes gagnantes ----------
// Les points de la ligne sont pris au centre des vraies cases affichées, pour tomber pile dessus.
function drawLines(lines) {
  const svg = $('lines');
  const box = svg.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.innerHTML = lines.map((l, i) => {
    const pts = LINES[l.line].map((row, r) => {
      const c = strips[r].children[row].getBoundingClientRect();
      return `${(c.left + c.width / 2 - box.left).toFixed(1)},${(c.top + c.height / 2 - box.top).toFixed(1)}`;
    });
    return `<path pathLength="1" style="animation-delay:${i * 0.45}s" d="M${pts.join('L')}"/>`;
  }).join('');
}

// ---------- tour ----------
function animate(res) {
  return new Promise((resolve) => {
    if (reduceMotion) { res.stops.forEach((s, i) => { current[i] = s; }); drawStatic(); resolve(); return; }
    let done = 0;
    // « frrrt » doux des rouleaux, qui baisse à chaque rouleau arrêté
    const whir = sfx.loop('reel', { vol: 0.9 });
    strips.forEach((s, r) => {
      const n = 18 + r * 7; // nombre de cases qui défilent
      const from = current[r], to = res.stops[r];
      // Cases de haut en bas : le nouveau résultat en haut, l'ancien affichage en bas ; la bande descend.
      const cells = [];
      for (let p = 0; p <= n + 2; p++) {
        const idx = p <= 2 ? to + p - 1 : p >= n ? from + (p - n) - 1 : Math.floor(Math.random() * L);
        cells.push(`<div class="cell">${symbolSVG(STRIPS[r][(idx + L * 4) % L])}</div>`);
      }
      s.innerHTML = cells.join('');
      s.style.transition = 'none';
      s.style.transform = `translateY(${-n * cell}px)`;
      void s.offsetHeight;
      s.style.transition = `transform ${1.1 + r * 0.45}s cubic-bezier(.2,.7,.25,1.04)`;
      s.style.transform = 'translateY(0)';
      s.addEventListener('transitionend', function end() {
        s.removeEventListener('transitionend', end);
        current[r] = to;
        sfx.play('chipStack', { vol: 0.9, gap: 0 }); // le rouleau s'arrête
        drawStatic(r);
        if (++done === 3) { whir.stop(); resolve(); } else whir.set(0.9 - done * 0.3, 1 - done * 0.08);
      });
    });
  });
}

async function spinOnce() {
  if (spinning) return false;
  const b = bet.get();
  spinning = true;
  lockBet(true);
  sfx.play('switch', { vol: 1 }); // le levier
  $('machine').classList.add('spinning');
  $('lines').innerHTML = '';
  $('result').textContent = '';
  $('result').className = 'result';
  try {
    const res = await casino.play('slots', 'spin', { bet: b, ...(autoOn ? { auto: autoId, i: autoI++ } : {}) });
    $('msg').textContent = '';
    await animate(res);
    casino.reveal(res.payout);
    stats.add(res.bet, res.payout, res.payout / res.bet);
    drawLines(res.lines);
    // Les symboles gagnants gigotent quand leur ligne passe dessus
    res.lines.forEach((l, i) => LINES[l.line].forEach((row, r) => {
      const c = strips[r].children[row];
      if (!c) return;
      c.classList.remove('win'); void c.offsetWidth;
      c.style.setProperty('--d', (i * 0.45 + 0.3 + r * 0.08) + 's');
      c.classList.add('win');
    }));
    if (res.payout > 0) {
      const big = res.payout / res.bet >= 10;
      $('result').className = 'result' + (big ? ' big' : '');
      $('result').textContent = `GAGNÉ ${eur(res.payout)} · ${res.lines.map((l) => SYMBOL_NAMES[l.sym] + ' ×' + l.mult).join(', ')}`;
    } else {
      $('result').textContent = 'Perdu';
    }
    return true;
  } catch (err) {
    $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
    return false;
  } finally {
    spinning = false;
    if (!autoOn) lockBet(false); // en série auto, la mise reste cachée jusqu'au dernier tour
    $('machine').classList.remove('spinning');
  }
}

// autoLeft = tours restants APRÈS celui en cours ; autoOn reste vrai jusqu'à la fin du dernier tour
let autoOn = false, autoId = '', autoI = 0; // série auto : une seule partie (et une ligne « Machine à sous auto N »)
function label() {
  const p = $('play');
  if (autoOn) { p.textContent = `Arrêter (${autoLeft} restant${autoLeft > 1 ? 's' : ''})`; p.classList.add('stop'); }
  else { p.textContent = autoN > 1 ? `Lancer ×${autoN}` : 'Lancer'; p.classList.remove('stop'); }
}
async function run() {
  if (autoOn) { autoLeft = 0; label(); return; } // s'arrête après le tour en cours
  if (spinning) return;
  if (autoN === 1) { await spinOnce(); return; }
  autoOn = true;
  autoLeft = autoN;
  autoId = Math.random().toString(36).slice(2, 12); autoI = 0;
  while (autoLeft > 0) {
    autoLeft--;
    label();
    if (!(await spinOnce())) break;
    if (autoLeft > 0) await new Promise((r) => setTimeout(r, 450));
  }
  autoOn = false;
  autoLeft = 0;
  lockBet(false);
  label();
}
$('play').addEventListener('click', run);
$('autoCount').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  autoN = +b.dataset.n;
  document.querySelectorAll('#autoCount button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  label();
});
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !$('shop').hidden) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'A') return;
  e.preventDefault();
  run();
});
window.addEventListener('resize', () => { if (!spinning) { setCell(); drawStatic(); } });

current.forEach((_, i) => { current[i] = Math.floor(Math.random() * L); });
setCell();
drawStatic();
label();
