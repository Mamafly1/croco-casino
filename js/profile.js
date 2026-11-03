// Fenêtre de profil d'un joueur : stats, courbe du solde (survol = ce qui l'a fait bouger), inventaire CS.
import { casino, eur, esc, nf0, $ } from './core.js';
import { pixelIcon, GAME_INFO } from './icons.js';
import { GAMES } from './engine/games.js';
import { TIER_INFO } from './engine/cases.js';
import { imgTag } from './steamimg.js';

const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const signed = (v) => (v > 0 ? '+' : '') + eur(v);
const when = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function box() {
  let m = $('profileBox');
  if (m) return m;
  m = document.createElement('div');
  m.className = 'modal';
  m.id = 'profileBox';
  m.hidden = true;
  m.innerHTML = `<div class="sheet wide prof" role="dialog" aria-modal="true" aria-labelledby="profTitle">
    <div class="sheet-head"><h2 id="profTitle"></h2><button class="x" id="profClose" type="button" aria-label="Fermer">${X_ICON}</button></div>
    <div class="step" id="profBody"></div></div>`;
  document.body.appendChild(m);
  const close = () => { m.hidden = true; };
  $('profClose').addEventListener('click', close);
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return m;
}

export async function openProfile(name) {
  const m = box();
  $('profTitle').textContent = name;
  $('profBody').innerHTML = '<p class="muted">Chargement…</p>';
  m.hidden = false;
  try {
    render(await casino.profile(name));
  } catch (e) {
    $('profBody').innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}

function render(p) {
  $('profTitle').innerHTML = `${esc(p.name)}${p.rank ? ` <span class="muted">#${p.rank}</span>` : ''}`;
  const games = GAMES.filter((g) => p.played[g]);
  const total = games.reduce((s, g) => s + p.played[g], 0);
  $('profBody').innerHTML = `
    <dl class="stat-grid prof-stats">
      <div><dt>Score</dt><dd class="${p.score > 0.004 ? 'pos' : p.score < -0.004 ? 'neg' : ''}">${signed(p.score)}</dd></div>
      <div><dt>Solde</dt><dd>${eur(p.balance)}</dd></div>
      <div><dt>Inventaire</dt><dd>${eur(p.inventoryValue)}</dd></div>
      <div><dt>Dépôts</dt><dd>${eur(p.deposits)}</dd></div>
    </dl>
    <div class="prof-games">${games.map((g) => `<span title="${GAME_INFO[g].name}">${pixelIcon(g, 18)}${nf0.format(p.played[g])}</span>`).join('') || '<span class="muted">Aucune partie</span>'}${total ? `<span class="muted">· ${nf0.format(total)} parties</span>` : ''}</div>
    <h3 class="h-label">Solde</h3>
    <div class="chart" id="profChart"></div>
    <h3 class="h-label">Inventaire CS${p.inventory.length ? ` · ${p.inventory.length}` : ''}</h3>
    <div class="prof-inv">${p.inventory.slice(0, 60).map((it) => `
      <div class="pi" style="--tc:${TIER_INFO[it.t] ? TIER_INFO[it.t].color : '#888'}" title="${esc(it.n)}">${imgTag(it.i, it.n, '128fx96f')}
        <b>${it.st ? '<span class="stt">ST</span> ' : ''}${esc(it.n)}</b><small>${it.wear || ''}${it.float != null ? ' · ' + it.float.toFixed(3) : ''}</small><small class="v">${eur(it.value)}</small></div>`).join('') || '<span class="muted">Vide</span>'}</div>`;
  chart($('profChart'), p.hist || []);
}

// Courbe du solde en escalier (le solde change par à-coups) ; survol : le mouvement le plus proche
function chart(el, hist) {
  if (hist.length < 2) { el.innerHTML = '<p class="muted">Pas encore assez de parties.</p>'; return; }
  const pts = [{ b: hist[0].b - hist[0].d, at: hist[0].at, start: true }, ...hist];
  const W = 640, H = 180, L = 46, R = 8, T = 10, B = 18;
  const vals = pts.map((x) => x.b);
  let lo = Math.min(0, ...vals), hi = Math.max(...vals);
  if (hi - lo < 1) hi = lo + 1;
  const pad = (hi - lo) * 0.08; hi += pad; if (lo < 0) lo -= pad;
  const x = (i) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let d = `M${x(0).toFixed(1)},${y(pts[0].b).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(i).toFixed(1)}V${y(pts[i].b).toFixed(1)}`;
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du solde, ${pts.length - 1} mouvements">
    ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="tick">${nf0.format(v)}</text>`).join('')}
    <path d="${d}" class="line"/>
    <line class="cross" id="cx" y1="${T}" y2="${H - B}" visibility="hidden"/>
    <circle class="dot" id="cd" r="4.5" visibility="hidden"/>
    <rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" id="hit"/>
  </svg><div class="tip" id="tip" hidden></div>`;
  const svg = el.querySelector('svg'), tip = el.querySelector('#tip');
  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const i = Math.max(1, Math.min(pts.length - 1, Math.round(((sx - L) / (W - L - R)) * (pts.length - 1))));
    const p = pts[i];
    el.querySelector('#cx').setAttribute('x1', x(i)); el.querySelector('#cx').setAttribute('x2', x(i));
    el.querySelector('#cx').setAttribute('visibility', 'visible');
    const dot = el.querySelector('#cd'); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.b)); dot.setAttribute('visibility', 'visible');
    tip.innerHTML = `<b>${esc(p.l)}</b><span class="${p.d > 0 ? 'pos' : 'neg'}">${signed(p.d)}</span><small>${eur(p.b)} · ${when(p.at)}</small>`;
    tip.hidden = false;
    const left = (x(i) / W) * r.width;
    tip.style.left = Math.max(0, Math.min(r.width - tip.offsetWidth, left - tip.offsetWidth / 2)) + 'px';
  };
  svg.addEventListener('pointermove', (e) => show(e.clientX));
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointerleave', () => { tip.hidden = true; el.querySelector('#cx').setAttribute('visibility', 'hidden'); el.querySelector('#cd').setAttribute('visibility', 'hidden'); });
}
