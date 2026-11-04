// Page caisses CS2 : vraies listes d'objets (fichiers du jeu via ByMykel/CSGO-API), vrais taux publiés par Valve,
// prix du marché (Skinport), skins en 3D par le visualiseur SkinHub.
import { casino, mountShell, $, eur, esc, nf0, loadCases, reduceMotion } from '../core.js';
import { img, imgTag } from '../steamimg.js';
import { mountFeed, floatBar } from '../widgets.js';
import { ODDS, TIERS, TIER_INFO, ST_RATE, WEARS, wearProbs, rtp, cost } from '../engine/cases.js';

mountShell('cases');
mountFeed($('feed'), { game: 'cases', limit: 8 });

let data = null, sel = null, opening = false;
const pctf = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 });
const pct = (x) => pctf.format(x * 100) + ' %';

// Images Steam : voir js/steamimg.js

const tc = (t) => TIER_INFO[t].color;
const wearName = (id) => (WEARS.find((w) => w.id === id) || {}).name || 'Sans usure';

// ---------- liste ----------
function renderList() {
  $('caseCount').textContent = data.cases.length;
  $('caselist').innerHTML = data.cases.map((c) =>
    `<button type="button" data-id="${c.id}" aria-pressed="${c === sel}">${imgTag(c.i, '', '96fx96f')}<span>${esc(c.n)}<small>${(c.d || '').slice(0, 4)} · ${eur(cost(c))} · retour ${pct(rtp(c))}</small></span></button>`).join('');
}
$('caselist').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || opening) return;
  select(data.cases.find((c) => c.id === b.dataset.id));
});

function pool(c, t) { return t === 'rare' ? c.rare : c.items.filter((x) => x.t === t); }

function priceRange(it) {
  const lo = Math.min(...it.pr), hi = Math.max(...it.pr);
  return lo === hi ? eur(lo) : `${eur(lo)} – ${eur(hi)}`;
}

// Le vrai modèle 3D de la caisse ; l'image reste affichée s'il n'existe pas ou ne se charge pas
let disposeCase = null, tokenCase = 0;
async function showCase3D(c) {
  const my = ++tokenCase;
  if (disposeCase) { disposeCase(); disposeCase = null; }
  try {
    const v = await import('../viewer3d.js?v=m12');
    const url = await v.caseModel(c.id);
    if (!url || my !== tokenCase) return;
    const host = $('case3d');
    const d = await v.mount(host, url);
    if (my !== tokenCase) { d(); return; }
    disposeCase = d;
    host.classList.add('on');
  } catch (e) {
    console.error(e);
  }
}

function select(c) {
  sel = c;
  document.querySelectorAll('#caselist button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === c.id)));
  $('casehead').innerHTML = `<div class="case3d" id="case3d">${imgTag(c.i, c.n, '256fx192f')}</div><div><h1>${esc(c.n.toUpperCase())}</h1><p>Sortie le ${esc(c.d || '?')} · ${c.items.length} skins + ${c.rare.length} objets rares</p><p>Caisse ${eur(c.pr)} + clé ${eur(c.key)}</p></div>`;
  showCase3D(c);
  $('open').textContent = `Ouvrir · ${eur(cost(c))}`;
  $('open').disabled = false;
  $('tiers').innerHTML = TIERS.map((t) => {
    const list = pool(c, t);
    if (!list.length) return '';
    const each = ODDS[t] / list.length;
    return `<div class="tier"><h3 style="--tc:${tc(t)}">${TIER_INFO[t].name}<span>${pct(ODDS[t])} au total · ${pct(each)} chacun</span></h3>
      <div class="grid">${list.map((it) => `<div class="it" style="--tc:${tc(t)}">${imgTag(it.i, it.n, '128fx96f')}<b title="${esc(it.n)}">${esc(it.n)}</b><small>${it.f ? `Float ${it.f[0]}–${it.f[1]}` : 'Sans usure'}${it.st ? ' · StatTrak possible' : ''}</small><small style="color:var(--gold)">${priceRange(it)}</small></div>`).join('')}</div></div>`;
  }).join('');
  idleTrack();
  preloadNext();
  writeOdds();
}

function writeOdds() {
  const r = sel ? rtp(sel) : 0;
  $('oddsNote').innerHTML = `Taux publiés par Valve pour chaque caisse : <strong>Mil-Spec 79,92 %</strong>, Restricted 15,98 %, Classified 3,20 %, Covert 0,64 %, <strong>couteau ou gants 0,26 %</strong> (1 sur ${nf0.format(1 / ODDS.rare)}). StatTrak™ : ${pct(ST_RATE)} des objets qui le permettent.<br>` +
    `L’usure vient du float, tiré ici uniformément entre le min et le max du skin (Valve ne publie pas la loi exacte). Les prix viennent du marché Skinport${data ? ` (relevés le ${esc(data.pricesAt)})` : ''} et peuvent différer de Steam ; quand une usure n’y est pas en vente, on prend la plus proche. La clé est estimée à partir de ses 2,50 $.` +
    (sel ? `<br>Une ouverture coûte ${eur(cost(sel))} ; l’objet vaut en moyenne <strong>${pct(r)}</strong> de ce prix. Tu perds donc <strong>${pct(1 - r)}</strong> par caisse sur la durée.` : '');
}

// ---------- roue d'ouverture ----------
const SLOT_W = () => (matchMedia('(max-width: 760px)').matches ? 110 : 140) + 6;
function slotHTML(x) { return `<div class="slot" style="--tc:${tc(x.t)}">${imgTag(x.i, '', '128fx96f')}<span>${esc(x.n)}</span></div>`; }
function idleTrack() {
  const all = [...sel.items, ...sel.items, ...sel.rare.slice(0, 2)];
  const t = $('track');
  t.style.transition = 'none';
  t.innerHTML = all.slice(0, 14).map(slotHTML).join('');
  t.style.transform = 'translateX(8px)';
}
function spinTrack(reel) {
  return new Promise((resolve) => {
    const t = $('track'), box = t.parentElement, w = SLOT_W();
    t.style.transition = 'none';
    t.style.transform = 'translateX(0)';
    t.innerHTML = reel.map(slotHTML).join('');
    void t.offsetWidth;
    const jitter = (Math.random() - 0.5) * (w - 30);
    const x = -(45 * w + (w - 6) / 2 - box.clientWidth / 2 + jitter);
    if (reduceMotion) { t.style.transform = `translateX(${x}px)`; resolve(); return; }
    t.style.transition = 'transform 5.2s cubic-bezier(.12,.72,.18,1)';
    t.style.transform = `translateX(${x}px)`;
    t.addEventListener('transitionend', () => resolve(), { once: true });
  });
}

$('open').addEventListener('click', async () => {
  if (!sel || opening) return;
  opening = true;
  // Tant que la roulette tourne, l'inventaire n'affiche pas le nouvel objet (sinon il dévoile le résultat)
  hiddenNew = new Set((casino.me.inventory || []).map((x) => x.uid));
  $('open').disabled = true;
  $('msg').textContent = '';
  try {
    const r = await casino.play('cases', 'open', { caseId: sel.id });
    casino.reveal(0); // le prix est déjà débité ; l'objet va dans l'inventaire
    preload3D(r.item); // la 3D charge pendant que la roulette tourne
    await spinTrack(r.reel);
    hiddenNew = null;
    showItem(r.item, true);
    renderInv();
  } catch (err) {
    $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
  } finally {
    opening = false;
    if (hiddenNew) { hiddenNew = null; renderInv(); }
    $('open').disabled = !sel;
  }
});

// ---------- visualiseur 3D ----------
// Le visualiseur SkinHub rend l'objet avec le shader du jeu, à son float et son seed.
// Son chargement est long (moteur, éclairage, shaders), donc on n'ouvre qu'UN cadre, dès l'arrivée sur la page,
// et on lui envoie ensuite chaque objet par message : seul le modèle de l'arme est rechargé, pas tout le reste.
// Le skin gagné est demandé dès le tirage, pendant que la roulette tourne.
// Tant que la 3D n'est pas prête (ou si elle échoue), la vue montre l'image officielle du skin.
const SKINHUB = 'https://skinhub.gg', MOBILE = matchMedia('(pointer: coarse), (max-width: 760px)').matches;
// Journal des événements 3D, pour le banc de test (?dev=1)
const T0 = performance.now();
const log3d = [];
function L(msg) { log3d.push(`${((performance.now() - T0) / 1000).toFixed(2)}s ${msg}`); if (log3d.length > 500) log3d.shift(); if (window.__devLog) window.__devLog(); }
const LIGHT = new URLSearchParams(location.search).get('eclairage') === 'none' ? 'none' : 'Mirage';
const v3 = { waiter: null, frame: null, listening: false, loadedKey: '', wantedKey: '', pending: null, shown: null, slowTimer: 0 };

// Ce que le visualiseur doit afficher pour un objet (le modèle et la peinture viennent des données de la caisse)
function spec(it) {
  const c = data && data.cases.find((x) => x.id === it.caseId);
  const src = c && pool(c, it.t).find((x) => x.n === it.n && (x.ph || null) === (it.ph || null));
  if (!src || !src.w) return null;
  return {
    key: src.w + ':' + src.p,
    item: { weaponType: src.w, paintIndex: src.p, float: it.float ?? 0, seed: it.seed ?? 0, statTrak: it.st ? 0 : false },
    zoom: /Gloves|Hand Wraps/.test(it.n) ? 0.75 : 1, // la paire de gants est trop large pour le cadre
  };
}
function post(patch) {
  if (patch.item) L('envoi ' + JSON.stringify(patch.item));
  v3.frame.contentWindow.postMessage({ channel: 'skinhub-viewer', v: 2, from: 'host', type: 'set', patch }, '*'); // rien de secret dans le message
}
function createFrame(sp) {
  const q = new URLSearchParams({
    weapon: sp.item.weaponType, paint: sp.item.paintIndex, float: sp.item.float, seed: sp.item.seed,
    zoom: sp.zoom, hostloading: 1, origin: location.origin,
    // Par défaut SkinHub éclaire avec Ancient de nuit : les skins paraissent noirs. Mirage de jour garde les couleurs.
    // Pour comparer les temps de chargement : caisses.html?eclairage=none utilise l'éclairage neutre de SkinHub.
    map: LIGHT, time: 'Day', rain: 0,
  });
  if (sp.item.statTrak !== false) q.set('st', 0);
  if (MOBILE) { q.set('scale', 1); q.set('bloom', 0); } // téléphone : moins de pixels, pas de bloom
  v3.frame = document.createElement('iframe');
  v3.frame.className = 'skinframe';
  v3.frame.title = 'Modèle 3D';
  v3.frame.src = `${SKINHUB}/frame?${q}`;
  v3.wantedKey = sp.key;
  L('cadre créé ' + sp.key + ' ' + v3.frame.src);
  $('scene').appendChild(v3.frame);
}
addEventListener('message', (e) => {
  if (!v3.frame || e.source !== v3.frame.contentWindow) return;
  const m = e.data;
  if (!m || m.channel !== 'skinhub-viewer' || m.from !== 'viewer') return;
  L('reçu ' + m.type + (m.type === 'error' ? ' ' + JSON.stringify(m.error) : '') + (m.type === 'resize' ? ` ${m.width}x${m.height} dpr ${m.dpr}` : '') + (m.problems && m.problems.length ? ' problèmes ' + JSON.stringify(m.problems) : ''));
  if (m.type === 'ready' && v3.waiter) { const w = v3.waiter; v3.waiter = null; w(); }
  if (m.type === 'hello') {
    if (m.problems && m.problems.length) console.warn('SkinHub', m.problems);
    v3.listening = true;
    if (v3.pending) { const p = v3.pending; v3.pending = null; send(p); }
  } else if (m.type === 'ready') {
    v3.loadedKey = v3.wantedKey;
    if ($('reveal').classList.contains('off')) frameIdle(true);
    refresh();
  } else if (m.type === 'error') {
    console.warn('SkinHub', m.error);
    if (m.error && m.error.code === 'render-failed' && v3.shown) {
      clearTimeout(v3.slowTimer);
      $('scene').classList.remove('loading3d');
      const note = $('m3dNote');
      if (note) note.textContent = 'Le modèle 3D n’a pas pu se charger : voici l’image officielle du skin.';
    }
  }
});
// Cadre au repos : quand l'objet est chargé et que la fenêtre est fermée, on le cache vraiment pour que le navigateur
// arrête de dessiner sa 3D (sinon deux scènes 3D tournent en continu et saturent la carte graphique du téléphone).
function frameIdle(on) { if (v3.frame) v3.frame.classList.toggle('idle', on); }
function send(sp) {
  frameIdle(false);
  if (!v3.frame) { createFrame(sp); return; }
  if (!v3.listening) { v3.pending = sp; return; }
  if (sp.key !== v3.wantedKey) { v3.wantedKey = sp.key; v3.loadedKey = ''; L('nouveau modèle ' + sp.key); } // on attend « ready »
  rot.baseZoom = sp.zoom;
  post({ item: sp.item, settings: { camera: { defaultZoom: sp.zoom * (rot.zoom || 1) } } });
  refresh();
}
// Demande un objet au visualiseur (sans l'afficher) : appelé dès le tirage, et pour réchauffer la page.
function preload3D(it) { const sp = spec(it); if (sp) send(sp); }

// Mode solo : la prochaine ouverture de la caisse choisie est tirée à l'avance (sans être montrée),
// et sa 3D charge pendant que tu regardes la page. Rien n'est fait tant qu'un objet est affiché.
let nextReq = 0;
async function preloadNext() {
  if (!sel || v3.shown) return;
  const my = ++nextReq, caseId = sel.id;
  const it = await casino.peekNext(caseId);
  if (!it || my !== nextReq || v3.shown || !sel || sel.id !== caseId) return;
  L('préchargement de la prochaine ouverture');
  preload3D({ ...it, caseId });
}

// Affiche la 3D dans la fenêtre de l'objet dès qu'elle est prête pour cet objet
function refresh() {
  const sc = $('scene'), note = $('m3dNote');
  if (!v3.shown || !note) return;
  const ok = v3.loadedKey && v3.loadedKey === v3.wantedKey && v3.wantedKey === v3.shown.key;
  sc.classList.toggle('has3d', !!ok);
  sc.classList.toggle('loading3d', !ok);
  const tg = $('viewToggle');
  if (tg) tg.hidden = !ok;
  if (ok) {
    clearTimeout(v3.slowTimer);
    note.innerHTML = 'Rendu 3D par <a href="https://skinhub.gg" target="_blank" rel="noopener">SkinHub</a>, avec le shader du jeu. L’arme regarde ta souris ; clique et glisse pour la tourner, molette pour zoomer.';
  }
}
function try3D(it) {
  const sp = spec(it), note = $('m3dNote');
  if (!sp) { note.textContent = 'Pas de modèle 3D pour cet objet : voici l’image officielle.'; return; }
  v3.shown = sp;
  clearTimeout(v3.slowTimer);
  v3.slowTimer = setTimeout(() => { if (v3.shown === sp) note.textContent = 'La connexion est lente : la 3D peut mettre une minute à arriver.'; }, 20000);
  send(sp);
}
// Réchauffe le visualiseur dès l'ouverture de la page, sans attendre les données des caisses :
// moteur, éclairage et shaders se chargent pendant que tu choisis ta caisse.
function warm3D() {
  send({ key: 'weapon_ak47:0', item: { weaponType: 'weapon_ak47', paintIndex: 0, float: 0.2, seed: 1, statTrak: false }, zoom: 1 });
}
// Contrôle de la 3D. Une couche transparente (.grab) au-dessus du cadre SkinHub reçoit la souris et le doigt,
// et on envoie les angles à SkinHub par `settings.camera` (sans rechargement) :
//  - sans clic, l'arme REGARDE le curseur (angle calculé comme si elle fixait un point devant l'écran) ;
//  - clic maintenu + glisser : on la tourne librement ; au relâchement elle se remet à regarder le curseur ;
//  - molette (ou pincement) : zoom.
const rot = { tx: 0, ty: 0, x: 0, y: 0, raf: 0, sent: '', drag: null, zoom: 1, baseZoom: 1, cx: null, cy: null };
const toDeg = 180 / Math.PI;
function rotTo(x, y) { rot.tx = x; rot.ty = y; if (!rot.raf) rot.raf = requestAnimationFrame(rotStep); }
function rotStep() {
  rot.raf = 0;
  const k = rot.drag ? 1 : 0.16; // en glisser : immédiat ; en suivi du curseur : en douceur
  rot.x += (rot.tx - rot.x) * k;
  rot.y += (rot.ty - rot.y) * k;
  if (Math.abs(rot.tx - rot.x) > 0.05 || Math.abs(rot.ty - rot.y) > 0.05) rot.raf = requestAnimationFrame(rotStep);
  else { rot.x = rot.tx; rot.y = rot.ty; }
  const yaw = Math.round(rot.x * 2) / 2, pitch = Math.round(rot.y * 2) / 2, key = yaw + ':' + pitch;
  if (key === rot.sent || !v3.frame || !v3.listening) return;
  rot.sent = key;
  post({ settings: { camera: { yaw, pitch } } });
}
// L'angle pour « regarder » un point du curseur : comme si le curseur était à une distance D devant l'écran
function lookAt(clientX, clientY) {
  const r = $('scene').getBoundingClientRect();
  const D = Math.max(r.width, r.height) * 0.75;
  const dx = clientX - (r.left + r.width / 2), dy = clientY - (r.top + r.height / 2);
  // Mouvement léger : au plus 15° à l'horizontale et 8° à la verticale
  const yaw = Math.atan2(dx, D) * toDeg * 0.45;    // à droite : l'arme se tourne vers la droite
  const pitch = Math.atan2(dy, D) * toDeg * 0.3;   // en haut : l'arme lève la tête (pitch négatif)
  return [Math.max(-15, Math.min(15, yaw)), Math.max(-8, Math.min(8, pitch))];
}
function look() {
  if (rot.drag || rot.cx == null || reduceMotion) return;
  const [y, p] = lookAt(rot.cx, rot.cy);
  rotTo(y, p);
}
document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  if ($('reveal').classList.contains('off') || !$('scene').classList.contains('has3d')) return;
  rot.cx = e.clientX; rot.cy = e.clientY;
  look();
});
$('reveal').addEventListener('mouseleave', () => { rot.cx = null; if (!rot.drag) rotTo(0, 0); });
// Couche de prise en main au-dessus de la 3D
const grab = document.createElement('div');
grab.className = 'grab';
grab.setAttribute('aria-hidden', 'true');
$('scene').appendChild(grab);
grab.addEventListener('pointerdown', (e) => {
  rot.drag = { x: e.clientX, y: e.clientY, yaw: rot.x, pitch: rot.y };
  grab.setPointerCapture(e.pointerId);
  grab.classList.add('held');
});
grab.addEventListener('pointermove', (e) => {
  if (!rot.drag) return;
  const yaw = rot.drag.yaw + (e.clientX - rot.drag.x) * 0.6;
  const pitch = Math.max(-85, Math.min(85, rot.drag.pitch + (e.clientY - rot.drag.y) * 0.4));
  rotTo(yaw, pitch);
});
const release = () => {
  if (!rot.drag) return;
  rot.drag = null;
  grab.classList.remove('held');
  rot.x = ((rot.x + 180) % 360 + 360) % 360 - 180; // évite de refaire plusieurs tours en revenant
  rot.tx = rot.x;
  if (rot.cx != null) look(); else rotTo(0, 0);
};
grab.addEventListener('pointerup', release);
grab.addEventListener('pointercancel', release);
grab.addEventListener('wheel', (e) => {
  e.preventDefault();
  rot.zoom = Math.max(0.6, Math.min(3, rot.zoom * Math.exp(-e.deltaY * 0.0015)));
  if (v3.frame && v3.listening) post({ settings: { camera: { defaultZoom: rot.baseZoom * rot.zoom } } });
}, { passive: false });
function rotReset() {
  cancelAnimationFrame(rot.raf);
  Object.assign(rot, { raf: 0, tx: 0, ty: 0, x: 0, y: 0, drag: null, zoom: 1 });
  if (rot.sent && rot.sent !== '0:0' && v3.frame && v3.listening) post({ settings: { camera: { yaw: 0, pitch: 0 } } });
  rot.sent = '0:0';
}

function stop3D() {
  rotReset();
  clearTimeout(v3.slowTimer);
  v3.shown = null;
  $('scene').classList.remove('has3d', 'loading3d', 'forceimg');
}

function showItem(it, fresh) {
  const m = $('reveal');
  m.querySelector('.sheet').style.setProperty('--tc', tc(it.t));
  $('scene').style.setProperty('--tc', tc(it.t));
  $('rvTitle').textContent = fresh ? 'Tu as obtenu' : 'Objet de ton inventaire';
  $('model').innerHTML = imgTag(it.i, it.n, '512fx384f');
  const c = data.cases.find((x) => x.id === it.caseId);
  const list = c ? pool(c, it.t) : [];
  const chance = list.length ? ODDS[it.t] / list.length : 0;
  const wp = it.range ? wearProbs(it.range).find((w) => w.id === it.wear) : null;
  $('specs').innerHTML = `
    <span class="rar" style="--tc:${tc(it.t)}">${TIER_INFO[it.t].name}</span>
    <h3>${it.st ? '<span style="color:#e47a3c">StatTrak™</span> ' : ''}${esc(it.n)}${it.ph ? ' · ' + esc(it.ph) : ''}</h3>
    ${it.float != null ? `<div><div class="field-head" style="margin-bottom:6px"><span>Float</span><span class="num" style="color:var(--ink)">${it.float.toFixed(9)}</span></div>${floatBar(it)}</div>` : ''}
    <dl class="kv">
      <dt>Usure</dt><dd>${wearName(it.wear)}</dd>
      ${it.range ? `<dt>Float possible</dt><dd>${it.range[0]} – ${it.range[1]}</dd>` : ''}
      ${wp ? `<dt>Chance de cette usure</dt><dd>${pct(wp.p)}</dd>` : ''}
      <dt>Chance de ce skin</dt><dd>${pct(chance)} (1 sur ${nf0.format(1 / chance)})</dd>
      <dt>StatTrak™</dt><dd>${it.st ? 'Oui (1 sur 10)' : 'Non'}</dd>
      ${c ? `<dt>Caisse</dt><dd>${esc(c.n)}</dd>` : ''}
      <dt>Prix du marché</dt><dd style="color:var(--gold)">${eur(it.value)}</dd>
    </dl>
    <p class="muted small" id="m3dNote">Chargement du modèle 3D…</p>
    <button class="btn-link small" id="viewToggle" type="button" hidden>Voir l’image officielle</button>
    <div class="btn2"><button class="btn-ghost" id="keep" type="button">Garder</button><button class="btn-main" id="sellOne" type="button">Vendre ${eur(it.value)}</button></div>`;
  $('viewToggle').addEventListener('click', () => {
    const img = $('scene').classList.toggle('forceimg');
    $('viewToggle').textContent = img ? 'Revoir la 3D' : 'Voir l’image officielle';
  });
  $('keep').addEventListener('click', closeReveal);
  $('sellOne').addEventListener('click', () => sell(it.uid).then(closeReveal));
  m.classList.remove('off'); m.inert = false; m.removeAttribute('aria-hidden');
  if (disposeCase && disposeCase.setPaused) disposeCase.setPaused(true); // la caisse est cachée par la fenêtre
  $('keep').focus();
  stop3D();
  try3D(it);
}
function closeReveal() {
  stop3D();
  const m = $('reveal');
  m.classList.add('off'); m.inert = true; m.setAttribute('aria-hidden', 'true');
  $('model').innerHTML = '';
  if (v3.loadedKey === v3.wantedKey) frameIdle(true);
  if (disposeCase && disposeCase.setPaused) disposeCase.setPaused(false);
  preloadNext();
}
$('rvClose').addEventListener('click', closeReveal);
$('reveal').addEventListener('click', (e) => { if (e.target === $('reveal')) closeReveal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('reveal').classList.contains('off')) closeReveal(); });

// ---------- inventaire ----------
async function sell(uid) {
  try {
    const r = await casino.play('cases', 'sell', uid === 'all' ? { all: true } : { uid });
    casino.reveal(r.payout);
    $('msg').className = 'msg ok';
    $('msg').textContent = r.payout ? `Vendu pour ${eur(r.payout)}.` : '';
    renderInv();
  } catch (err) {
    $('msg').className = 'msg';
    $('msg').textContent = err.message;
  }
}
let hiddenNew = null;
function renderInv() {
  const all = casino.me.inventory || [];
  const inv = hiddenNew ? all.filter((x) => hiddenNew.has(x.uid)) : all;
  $('tabInv').textContent = `Inventaire (${inv.length})`;
  const val = inv.reduce((t, x) => t + x.value, 0);
  $('invSum').textContent = inv.length ? `${inv.length} objet${inv.length > 1 ? 's' : ''} · valeur ${eur(val)}` : 'Inventaire vide : ouvre une caisse.';
  $('sellAll').disabled = !inv.length;
  if (!data) return;
  $('inv').innerHTML = inv.map((it) => `<button type="button" class="it" data-uid="${it.uid}" style="--tc:${tc(it.t)}">${it.st ? '<span class="st">ST</span>' : ''}${imgTag(it.i, it.n, '128fx96f')}<b title="${esc(it.n)}">${esc(it.n)}</b><small>${it.wear || 'Sans usure'}${it.float != null ? ' · ' + it.float.toFixed(4) : ''}</small><small style="color:var(--gold)">${eur(it.value)}</small></button>`).join('');
}
$('inv').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]'); if (!b) return;
  const it = (casino.me.inventory || []).find((x) => x.uid === b.dataset.uid);
  if (it) showItem(it, false);
});
$('sellAll').addEventListener('click', () => { if (confirm('Vendre tout l’inventaire ?')) sell('all'); });
casino.on('me', renderInv);

function tab(which) {
  $('tabContent').setAttribute('aria-pressed', String(which === 'content'));
  $('tabInv').setAttribute('aria-pressed', String(which === 'inv'));
  $('contentBox').hidden = which !== 'content';
  $('invBox').hidden = which !== 'inv';
}
$('tabContent').addEventListener('click', () => tab('content'));
$('tabInv').addEventListener('click', () => tab('inv'));

// ---------- démarrage ----------
writeOdds();
loadCases().then((d) => {
  data = d;
  renderList();
  select(data.cases[0]);
  renderInv();
}).catch(() => { $('msg').textContent = 'Impossible de charger la liste des caisses.'; });
if (casino.online) { warm3D(); casino.on('status', (st) => { if (st === 'online') preloadNext(); }); }

// ---------- banc de test 3D (caisses.html?dev=1) ----------
// Mesure le temps entre la demande d'un modèle et l'événement « ready » de SkinHub, dans plusieurs situations,
// et permet de copier tout le journal pour l'envoyer.
let devReady = false;
function initDev() {
  if (devReady) return;
  devReady = true;
  const box = document.createElement('div');
  box.id = 'devbox';
  box.className = 'min'; // replié par défaut : le panneau ne cache pas les boutons de la page
  box.innerHTML = `<b>Test 3D</b><div class="dev-btns"><button type="button" id="devRun">Lancer le test</button><button type="button" id="devRot">Essai rotation</button><button type="button" id="devCopy">Copier le log</button><button type="button" id="devHide">±</button></div><pre id="devOut"></pre>`;
  document.body.appendChild(box);
  const st = document.createElement('style');
  st.textContent = `#devbox{position:fixed;z-index:50;left:8px;top:8px;width:min(360px,calc(100vw - 70px));max-height:45vh;display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:10px;background:#000;border:2px solid var(--gold);font:12px/1.4 ui-monospace,monospace;color:#f0f0e6}
  #devbox .dev-btns{display:flex;gap:6px}#devbox button{flex:1;padding:8px;border:0;border-radius:6px;background:var(--gold);color:#181818;font-weight:800}
  #devbox #devHide{flex:0 0 36px;background:#444;color:#fff}#devbox pre{margin:0;overflow:auto;white-space:pre-wrap;flex:1}#devbox.min pre{display:none}#devbox.min{width:auto;padding:6px}#devbox.min b{display:none}`;
  document.head.appendChild(st);
  const out = $('devOut');
  const results = [];
  window.__devLog = () => { out.textContent = [...results, '---', ...log3d.slice(-12)].join('\n'); out.scrollTop = out.scrollHeight; };
  $('devHide').onclick = () => box.classList.toggle('min');
  const env = () => {
    const c = navigator.connection || {};
    return [`page ${location.href}`, `navigateur ${navigator.userAgent}`, `écran ${innerWidth}x${innerHeight} dpr ${devicePixelRatio}`,
      `réseau ${c.effectiveType || '?'} débit ${c.downlink ?? '?'} Mb/s rtt ${c.rtt ?? '?'} ms économie ${c.saveData ?? '?'}`,
      `réglages éclairage ${LIGHT} mobile ${MOBILE}`, `heure ${new Date().toISOString()}`];
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function waitReady(timeout = 60000) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { v3.waiter = null; resolve(false); }, timeout);
      v3.waiter = () => { clearTimeout(t); resolve(true); };
    });
  }
  function pick() {
    // Des objets variés : fusil, pistolet, couteau, gants, pris dans les vraies caisses
    const all = data.cases.flatMap((c) => [...c.items, ...c.rare].map((x) => ({ ...x, caseId: c.id })));
    const find = (f) => all.find(f);
    return [
      find((x) => /^AK-47 \|/.test(x.n)), find((x) => /^Glock-18 \|/.test(x.n)), find((x) => /^AWP \|/.test(x.n)),
      find((x) => x.t === 'rare' && /Karambit \|/.test(x.n)), find((x) => x.t === 'rare' && /Gloves|Hand Wraps/.test(x.n)),
      find((x) => /^USP-S \|/.test(x.n)),
    ].filter(Boolean).map((x) => ({ ...x, float: 0.15, seed: 7 }));
  }
  function showModal(visible) {
    const m = $('reveal');
    if (visible) { m.classList.remove('off'); m.inert = false; $('scene').classList.add('has3d'); }
    else { m.classList.add('off'); m.inert = true; $('scene').classList.remove('has3d'); }
  }
  async function one(label, it, visible) {
    showModal(visible);
    const sp = spec(it);
    if (!sp) { results.push(`${label} ${it.n} : pas de modèle`); return; }
    if (sp.key === v3.wantedKey) { results.push(`${label} ${it.n} : déjà chargé, ignoré`); return; }
    const t = performance.now();
    L(`TEST ${label} ${it.n}`);
    send(sp);
    const ok = await waitReady();
    results.push(`${label} ${visible ? 'visible' : 'caché'} ${it.n} : ${ok ? Math.round(performance.now() - t) + ' ms' : 'PAS DE READY en 60 s'}`);
    window.__devLog();
  }
  $('devRun').onclick = async () => {
    if (!data) { results.push('données pas encore chargées, réessaie'); window.__devLog(); return; }
    $('devRun').disabled = true;
    box.classList.remove('min');
    results.length = 0;
    results.push(...env(), `cadre déjà prêt au lancement : ${v3.loadedKey ? 'oui (' + v3.loadedKey + ')' : 'non'}`);
    const items = pick();
    // 1. Modèles différents, fenêtre visible
    for (const it of items.slice(0, 3)) await one('A', it, true);
    // 2. Modèles différents, fenêtre cachée (comme pendant la roulette)
    for (const it of items.slice(3)) await one('B', it, false);
    // 3. Retour à un modèle déjà vu (le cache aide-t-il ?)
    await one('C', items[0], true);
    // 4. Changement de float seul (sans rechargement attendu)
    { const sp = spec({ ...items[0], float: 0.6 }); const t = performance.now(); send(sp); await wait(1500); results.push(`D float seul : envoyé, ${Math.round(performance.now() - t)} ms sans attendre ready`); }
    // 5. Démarrage à froid : nouveau cadre, visible
    showModal(true);
    if (v3.frame) v3.frame.remove();
    Object.assign(v3, { frame: null, listening: false, loadedKey: '', wantedKey: '', pending: null });
    { const t = performance.now(); L('TEST E démarrage à froid'); send(spec(items[1])); const ok = await waitReady(90000); results.push(`E démarrage à froid ${items[1].n} : ${ok ? Math.round(performance.now() - t) + ' ms' : 'PAS DE READY en 90 s'}`); }
    showModal(false);
    results.push('terminé');
    window.__devLog();
    $('devRun').disabled = false;
  };
  // Essai : SkinHub accepte-t-il un angle par message (non documenté) ? On ouvre la 3D et on essaie 3 formes.
  $('devRot').onclick = async () => {
    if (!data) return;
    box.classList.remove('min');
    results.length = 0;
    const it = { ...data.cases[0].items[0], caseId: data.cases[0].id, float: 0.15, seed: 7 };
    showModal(true);
    const sp = spec(it);
    if (sp.key !== v3.wantedKey) { send(sp); results.push('chargement de l’arme…'); window.__devLog(); await waitReady(); }
    const tries = [
      ['settings.camera.yaw/pitch', { settings: { camera: { yaw: 60, pitch: 20 } } }],
      ['yaw/pitch à la racine', { yaw: -60, pitch: -15 }],
      ['camera à la racine', { camera: { yaw: 120, pitch: 0 } }],
    ];
    for (const [label, patch] of tries) {
      L('ESSAI ' + label);
      results.push(`essai « ${label} » : regarde si l’arme tourne…`);
      window.__devLog();
      post(patch);
      await wait(4000);
    }
    post({ settings: { camera: { yaw: 0, pitch: 0 } } });
    results.push('terminé : dis à Claude quel essai a fait tourner l’arme (ou aucun), et copie le log');
    window.__devLog();
  };
  $('devCopy').onclick = async () => {
    const text = [...env(), '', 'RÉSULTATS', ...results, '', 'JOURNAL', ...log3d].join('\n');
    try { await navigator.clipboard.writeText(text); $('devCopy').textContent = 'Copié !'; }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); $('devCopy').textContent = 'Copié (secours)';
    }
    setTimeout(() => { $('devCopy').textContent = 'Copier le log'; }, 2000);
  };
  window.__devLog();
}
if (new URLSearchParams(location.search).has('dev')) initDev();
$('devOpen').addEventListener('click', () => { $('infoBox').hidden = true; initDev(); $('devbox').classList.remove('min'); });
// Les vraies cotes : dans une fenêtre ouverte par le bouton (i)
$('infoOpen').addEventListener('click', () => { $('infoBox').hidden = false; $('infoClose').focus(); });
$('infoClose').addEventListener('click', () => { $('infoBox').hidden = true; });
$('infoBox').addEventListener('click', (e) => { if (e.target === $('infoBox')) $('infoBox').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('infoBox').hidden = true; });
