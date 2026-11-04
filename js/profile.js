// Fenêtre de profil d'un joueur : stats, courbe du solde (survol = ce qui l'a fait bouger), inventaire CS.
import { casino, eur, esc, nf0, $, loadCases, forceUpdate, switchPlayer, toast } from './core.js';
import { pixelIcon, GAME_INFO } from './icons.js';
import { GAMES } from './engine/games.js';
import { TIER_INFO, WEARS, ODDS, wearProbs } from './engine/cases.js';
import { imgTag } from './steamimg.js';
import { floatBar } from './widgets.js';

const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const signed = (v) => (v > 0 ? '+' : '') + eur(v);
const pctf = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 });
const pct = (x) => pctf.format(x * 100) + ' %';
const BACK = '<button class="btn-link small prof-back" type="button" data-view="main">← Retour au profil</button>';
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
  $('profBody').addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'), fl = e.target.closest('[data-filter]'), pi = e.target.closest('[data-item]');
    const sw = e.target.closest('[data-color]');
    if (sw && !sw.disabled) { last.style = { ...(last.style || {}), color: sw.dataset.color || null }; render(last); saveStyle({ color: sw.dataset.color || null }); return; }
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'update') { act.textContent = 'Mise à jour…'; forceUpdate(); return; }
    if (act && act.dataset.act === 'logout') { if (confirm('Te déconnecter de cet appareil ? Il faudra retaper ton code.')) { m.hidden = true; switchPlayer(); } return; }
    if (e.target.closest('[data-more]')) {
      if (olderBusy) return;
      const oldest = older.length ? older[older.length - 1].id : (last.hist[0] || {}).id;
      olderBusy = true; renderGames(last);
      casino.history(last.name, oldest).then((rows) => { older = older.concat(rows); if (rows.length < 400) olderDone = true; })
        .catch(() => {}).finally(() => { olderBusy = false; if (view.kind === 'games') renderGames(last); });
      return;
    }
    if (e.target.closest('[data-gif]')) { m.hidden = true; import('./gifs.js?v=g1').then((g) => g.openGifSender(last.name)); return; }
    if (v) view = { kind: v.dataset.view };
    else if (fl) view = { kind: 'games', filter: fl.dataset.filter || null };
    else if (pi) { const it = last.inventory[+pi.dataset.item]; view = { kind: 'item', uid: it.uid, it }; }
    else return;
    render(last);
    m.scrollTop = 0; m.querySelector('.sheet').scrollTop = 0;
  });
  // titres affichés : on garde les cases cochées
  $('profBody').addEventListener('change', (e) => {
    if (!e.target.matches('[data-title]')) return;
    const titles = [...$('profBody').querySelectorAll('[data-title]:checked')].map((x) => x.dataset.title);
    saveStyle({ titles });
  });
  // changer de pseudo
  $('profBody').addEventListener('submit', async (e) => {
    if (e.target.id !== 'setName') return;
    e.preventDefault();
    const name = $('setNameIn').value.trim();
    if (!name || name === last.name) return;
    try {
      await casino.play('account', 'rename', { name });
      toast(`Tu t’appelles maintenant ${name}`);
      openProfile(name);
    } catch (err) { toast(err.message); }
  });
  return m;
}

// Profil en direct : tant qu'il est ouvert, il se recharge quand ce joueur joue (fil), quand le classement bouge
// ou quand c'est le tien et que ton solde change.
let current = null, refreshTimer = 0, last = null;
// Vue affichée dans la fenêtre : le profil, la liste des parties (avec filtre) ou la fiche d'un objet
let view = { kind: 'main' };
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    const m = $('profileBox');
    if (!current || !m || m.hidden) return;
    try { render(await casino.profile(current)); } catch { /* garde l'affichage actuel */ }
  }, 700);
}
casino.on('feed', (e) => { if (e && e.name === current) refreshSoon(); });
casino.on('board', () => refreshSoon());
casino.on('me', (me) => { if (me && me.name === current) refreshSoon(); });

export async function openProfile(name) {
  current = name; view = { kind: 'main' }; older = []; olderDone = false;
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
  current = p.name; last = p;
  if (view.kind === 'games') return renderGames(p);
  if (view.kind === 'item') { const it = p.inventory.find((x) => (view.uid ? x.uid === view.uid : x.n === view.it.n && x.float === view.it.float)); if (it) return renderItem(p, it); view = { kind: 'main' }; }
  $('profTitle').innerHTML = `${casino.online ? `<span class="dot-on${p.online || p.name === casino.me.name ? ' on' : ''}" title="${p.online || p.name === casino.me.name ? 'En ligne' : 'Hors ligne'}"></span>` : ''}${esc(p.name)}${p.rank ? ` <span class="muted">#${p.rank}</span>` : ''}${(p.titles || []).map((t) => ` <small class="ttl">${esc(t)}</small>`).join('')}`;
  const games = GAMES.filter((g) => p.played[g]);
  const total = games.reduce((s, g) => s + p.played[g], 0);
  const mine = p.name === casino.me.name, stock = mine ? casino.me.gifs || {} : null;
  $('profBody').innerHTML = `
    ${mine ? settings(p) : casino.online && p.online ? `<button class="btn-main" type="button" data-gif>Envoyer un gif à ${esc(p.name)}</button>`
      : casino.online ? `<p class="muted small" style="margin:0">${esc(p.name)} est hors ligne : les gifs ne s’envoient qu’aux joueurs connectés.</p>` : ''}
    ${stock ? `<p class="muted small" style="margin:0">Gifs en stock : DVD ${stock.dvd || 0} · Gravité ${stock.gravity || 0} · Plein écran ${stock.full || 0}</p>` : ''}
    <dl class="stat-grid prof-stats">
      <div><dt>Argent total</dt><dd class="${p.score > 0.004 ? 'pos' : p.score < -0.004 ? 'neg' : ''}">${signed(p.score)}</dd></div>
      <div><dt>Solde</dt><dd>${eur(p.balance)}</dd></div>
      <div><dt>Inventaire</dt><dd>${eur(p.inventoryValue)}</dd></div>
      <div><dt>Dépôts</dt><dd>${eur(p.deposits)}</dd></div>
    </dl>
    ${total ? `<button class="prof-games" type="button" data-view="games" aria-label="Voir les ${nf0.format(total)} parties">${games.map((g) => `<span title="${GAME_INFO[g].name}">${pixelIcon(g, 16)}${nf0.format(p.played[g])}</span>`).join('')}<span class="tot">${nf0.format(total)} parties ›</span></button>` : '<p class="muted">Aucune partie</p>'}
    <h3 class="h-label">Solde</h3>
    <div class="chart" id="profChart"></div>
    <h3 class="h-label">Inventaire CS${p.inventory.length ? ` · ${p.inventory.length}` : ''}</h3>
    <div class="prof-inv">${p.inventory.slice(0, 60).map((it, k) => `
      <button type="button" class="pi" data-item="${k}" style="--tc:${TIER_INFO[it.t] ? TIER_INFO[it.t].color : '#888'}" title="${esc(it.n)}">${imgTag(it.i, it.n, '128fx96f')}
        <b>${it.st ? '<span class="stt">ST</span> ' : ''}${esc(it.n)}</b><small>${it.wear || ''}${it.float != null ? ' · ' + it.float.toFixed(3) : ''}</small><small class="v">${eur(it.value)}</small></button>`).join('') || '<span class="muted">Vide</span>'}</div>`;
  chart($('profChart'), p.hist || []);
}

// Réglages, sur son propre profil : pseudo, couleur de sa carte au classement, titres affichés, mise à jour, déconnexion
function settings(p) {
  const st = p.style || {}, held = p.heldTitles || [], shown = Array.isArray(st.titles) ? st.titles : held;
  const online = casino.online;
  return `<section class="settings" aria-label="Réglages">
    ${online ? `<form class="set-name" id="setName"><label class="field-head" for="setNameIn"><span>Pseudo</span></label>
      <div class="set-row"><input class="text-in" id="setNameIn" value="${esc(p.name)}" maxlength="16" autocomplete="nickname"><button class="btn-ghost" type="submit">Changer</button></div></form>
    <div class="field"><div class="field-head"><span>Couleur de ta carte au classement</span></div>
      <div class="swatches" role="group" aria-label="Couleur de ta carte">
        <button type="button" data-color="" class="sw auto" aria-pressed="${!st.color}" title="Couleur du rang">Auto</button>
        ${(p.colors || []).map((c) => { const by = (p.takenColors || {})[c]; return `<button type="button" data-color="${c}" class="sw${by ? ' taken' : ''}" style="--sw:${c}" aria-pressed="${st.color === c}"${by ? ` disabled title="Déjà prise par ${esc(by)}" aria-label="Couleur prise par ${esc(by)}"` : ` aria-label="Couleur ${c}"`}></button>`; }).join('')}
      </div></div>
    <div class="field"><div class="field-head"><span>Titres affichés à côté de ton pseudo</span></div>
      ${held.length ? `<div class="set-titles">${held.map((t) => `<label><input type="checkbox" data-title="${esc(t)}"${shown.includes(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>`
        : '<p class="muted small" style="margin:0">Pas encore de titre : sois premier d’un classement pour en gagner un.</p>'}</div>` : ''}
    <div class="set-row">
      <button class="btn-ghost" type="button" data-act="update">Forcer la mise à jour</button>
      ${online ? '<button class="btn-ghost danger" type="button" data-act="logout">Se déconnecter</button>' : ''}
    </div>
  </section>`;
}
async function saveStyle(patch) {
  try { await casino.play('account', 'style', patch); refreshSoon(); } catch (e) { toast(e.message); }
}

// Toutes les parties (les mouvements du solde), filtrables par jeu
const KIND_NAME = { wallet: 'Dépôts', admin: 'Admin', work: 'Travail', gifs: 'Gifs' };
const kindName = (g) => (GAME_INFO[g] ? GAME_INFO[g].name : KIND_NAME[g] || 'Autre');
// Le profil arrive avec les 400 derniers mouvements ; « Voir plus » charge les précédents, 400 par 400
let older = [], olderDone = false, olderBusy = false;
function renderGames(p) {
  const hist = (p.hist || []).slice().reverse().concat(older);
  const kinds = [...new Set(hist.map((h) => h.g || 'autre'))];
  const f = view.filter && kinds.includes(view.filter) ? view.filter : null;
  const list = f ? hist.filter((h) => (h.g || 'autre') === f) : hist;
  $('profTitle').innerHTML = `${esc(p.name)} <span class="muted">· parties</span>`;
  $('profBody').innerHTML = `${BACK}
    <div class="chips wide prof-filter" role="group" aria-label="Filtrer par jeu">
      <button type="button" data-filter="" aria-pressed="${!f}">Tout</button>
      ${kinds.map((g) => `<button type="button" data-filter="${esc(g)}" aria-pressed="${f === g}">${pixelIcon(g, 16)}${esc(kindName(g))}</button>`).join('')}
    </div>
    ${list.length ? `<ul class="hist">${list.map((h) => `<li>${pixelIcon(h.g, 18) || '<span class="hi-dot"></span>'}
      <span class="hl"><b>${esc(h.l)}</b><small>${when(h.at)} · solde ${eur(h.b)}</small></span>
      <span class="amt ${h.d > 0 ? 'pos' : h.d < 0 ? 'neg' : ''}">${signed(h.d)}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune partie.</p>'}
    ${(p.hist || []).length >= 400 && !olderDone ? `<button class="btn-ghost" type="button" data-more>${olderBusy ? 'Chargement…' : 'Voir les parties plus anciennes'}</button>` : ''}`;
}

// Fiche d'un objet de l'inventaire, comme à l'ouverture (sans Garder / Vendre)
let caseData = null;
function renderItem(p, it) {
  const color = TIER_INFO[it.t] ? TIER_INFO[it.t].color : '#888';
  const wearName = (WEARS.find((w) => w.id === it.wear) || {}).name || 'Sans usure';
  const wp = it.range ? (wearProbs(it.range) || []).find((w) => w.id === it.wear) : null;
  const c = caseData && it.caseId ? caseData.cases.find((x) => x.id === it.caseId) : null;
  const list = c ? (it.t === 'rare' ? c.rare : c.items.filter((x) => x.t === it.t)) : [];
  const chance = list.length ? ODDS[it.t] / list.length : 0;
  $('profTitle').innerHTML = `${esc(p.name)} <span class="muted">· objet</span>`;
  $('profBody').innerHTML = `${BACK}
    <div class="prof-item" style="--tc:${color}">
      <div class="pi-scene">${imgTag(it.i, it.n, '512fx384f')}</div>
      <div class="pi-specs">
        <span class="rar">${TIER_INFO[it.t] ? TIER_INFO[it.t].name : esc(it.t)}</span>
        <h3>${it.st ? '<span style="color:#e47a3c">StatTrak™</span> ' : ''}${esc(it.n)}${it.ph ? ' · ' + esc(it.ph) : ''}</h3>
        ${it.float != null ? `<div><div class="field-head" style="margin-bottom:6px"><span>Float</span><span class="num" style="color:var(--ink)">${it.float.toFixed(9)}</span></div>${floatBar(it)}</div>` : ''}
        <dl class="kv">
          <dt>Usure</dt><dd>${wearName}</dd>
          ${it.range ? `<dt>Float possible</dt><dd>${it.range[0]} – ${it.range[1]}</dd>` : ''}
          ${wp ? `<dt>Chance de cette usure</dt><dd>${pct(wp.p)}</dd>` : ''}
          ${chance ? `<dt>Chance de ce skin</dt><dd>${pct(chance)} (1 sur ${nf0.format(1 / chance)})</dd>` : ''}
          <dt>StatTrak™</dt><dd>${it.st ? 'Oui (1 sur 10)' : 'Non'}</dd>
          ${c ? `<dt>Caisse</dt><dd>${esc(c.n)}</dd>` : ''}
          ${it.at ? `<dt>Obtenu le</dt><dd>${when(it.at)}</dd>` : ''}
          <dt>Prix du marché</dt><dd style="color:var(--gold)">${eur(it.value)}</dd>
        </dl>
      </div>
    </div>`;
  // Nom de la caisse et chance du skin : il faut la liste des caisses, chargée à la demande
  if (!caseData && it.caseId) loadCases().then((d) => { caseData = d; if (view.kind === 'item' && last === p) renderItem(p, it); }).catch(() => {});
}

// Courbe du solde en escalier (le solde change par à-coups) ; survol : le mouvement le plus proche
function chart(el, hist) {
  if (!hist.length) { el.innerHTML = '<p class="muted">Aucune partie enregistrée.</p>'; return; }
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
