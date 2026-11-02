// Page caisses CS2 : vraies listes d'objets (fichiers du jeu via ByMykel/CSGO-API), vrais taux publiés par Valve,
// prix du marché (Skinport), skins en 3D par le visualiseur SkinHub.
import { casino, mountShell, $, eur, esc, nf0, loadCases, reduceMotion } from '../core.js';
import { mountFeed } from '../widgets.js';
import { ODDS, TIERS, TIER_INFO, ST_RATE, WEARS, wearProbs, rtp, cost } from '../engine/cases.js';

mountShell('cases');
mountFeed($('feed'), { game: 'cases', limit: 8 });

let data = null, sel = null, opening = false;
const pctf = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 });
const pct = (x) => pctf.format(x * 100) + ' %';

// Images Steam : on demande une taille réduite, et on retombe sur l'image brute si le serveur refuse
const img = (i, size = '256fx256f') => (i ? data.img + i + '/' + size : '');
const imgTag = (i, alt, size) => `<img src="${img(i, size)}" data-raw="${data.img + i}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`;
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName !== 'IMG' || !t.dataset.raw) return;
  if (t.src !== t.dataset.raw) t.src = t.dataset.raw;
  else t.style.visibility = 'hidden';
}, true);

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
    const v = await import('../viewer3d.js');
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
    return `<div class="tier"><h3 style="color:${tc(t)}">${TIER_INFO[t].name}<span>${pct(ODDS[t])} au total · ${pct(each)} chacun</span></h3>
      <div class="grid">${list.map((it) => `<div class="it" style="--tc:${tc(t)}">${imgTag(it.i, it.n, '128fx96f')}<b title="${esc(it.n)}">${esc(it.n)}</b><small>${it.f ? `Float ${it.f[0]}–${it.f[1]}` : 'Sans usure'}${it.st ? ' · StatTrak possible' : ''}</small><small style="color:var(--gold)">${priceRange(it)}</small></div>`).join('')}</div></div>`;
  }).join('');
  idleTrack();
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
  $('open').disabled = true;
  $('msg').textContent = '';
  try {
    const r = await casino.play('cases', 'open', { caseId: sel.id });
    casino.reveal(0); // le prix est déjà débité ; l'objet va dans l'inventaire
    await spinTrack(r.reel);
    showItem(r.item, true);
    renderInv();
  } catch (err) {
    $('msg').textContent = err.message;
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
  } finally {
    opening = false;
    $('open').disabled = !sel;
  }
});

// ---------- visualiseur 3D ----------
// Le visualiseur SkinHub rend l'objet avec le shader du jeu, à son float et son seed. Tant qu'il charge
// (ou s'il échoue), on montre l'image du skin extrudée en empilant des copies dans l'épaisseur.
const SKINHUB = 'https://skinhub.gg/frame';
let frame = null, onFrame = null;
function try3D(it) {
  const c = data && data.cases.find((x) => x.id === it.caseId);
  const src = c && pool(c, it.t).find((x) => x.n === it.n && (x.ph || null) === (it.ph || null));
  const q = new URLSearchParams({ hash: it.n, hostloading: 1 });
  if (src) q.set('paint', src.p); // indispensable pour la phase d'un Doppler
  if (it.float != null) q.set('float', it.float);
  if (it.seed != null) q.set('seed', it.seed);
  if (it.st) q.set('st', 0);
  if (/Gloves|Hand Wraps/.test(it.n)) q.set('zoom', 0.75); // la paire est trop large pour le cadre
  const scene = $('scene'), note = $('m3dNote');
  scene.classList.add('loading3d');
  frame = document.createElement('iframe');
  frame.className = 'skinframe';
  frame.title = `Modèle 3D : ${it.n}`;
  frame.src = `${SKINHUB}?${q}`;
  onFrame = (e) => {
    if (e.source !== frame.contentWindow || !e.data || e.data.channel !== 'skinhub-viewer') return;
    if (e.data.type === 'ready') {
      scene.classList.remove('loading3d');
      scene.classList.add('has3d');
      note.innerHTML = 'Rendu 3D par <a href="https://skinhub.gg" target="_blank" rel="noopener">SkinHub</a>, avec le shader du jeu. Tourne-le à la souris ou au doigt, molette pour zoomer.';
    } else if (e.data.type === 'error') {
      scene.classList.remove('loading3d');
      note.textContent = 'Le modèle 3D n’a pas pu se charger : relief reconstitué à partir de l’image.';
    }
  };
  addEventListener('message', onFrame);
  scene.appendChild(frame);
}
function stop3D() {
  if (frame) { removeEventListener('message', onFrame); frame.remove(); frame = null; }
  $('scene').classList.remove('has3d', 'loading3d');
}
let rotY = -25, rotX = 8, auto = true, raf = 0, last = 0;
function buildModel(it) {
  const LAYERS = 12, DEPTH = 1.6;
  let h = '';
  for (let i = 0; i < LAYERS; i++) {
    const z = (i - (LAYERS - 1) / 2) * DEPTH;
    const edge = i > 0 && i < LAYERS - 1;
    h += `<img src="${img(it.i, '512fx384f')}" data-raw="${data.img + it.i}" alt="" draggable="false" style="transform:translateZ(${z}px)${i === 0 ? ' rotateY(180deg)' : ''};${edge ? 'filter:brightness(.42) saturate(.8)' : ''}">`;
  }
  $('model').innerHTML = h;
}
function spinLoop(now) {
  const dt = Math.min(50, now - (last || now));
  last = now;
  if (auto) rotY += dt * 0.03;
  $('model').style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  raf = requestAnimationFrame(spinLoop);
}
(function drag() {
  const sc = $('scene');
  let down = null;
  sc.addEventListener('pointerdown', (e) => { if (sc.classList.contains('has3d')) return; down = { x: e.clientX, y: e.clientY, ry: rotY, rx: rotX }; auto = false; sc.setPointerCapture(e.pointerId); });
  sc.addEventListener('pointermove', (e) => {
    if (!down) return;
    rotY = down.ry + (e.clientX - down.x) * 0.5;
    rotX = Math.max(-40, Math.min(40, down.rx - (e.clientY - down.y) * 0.3));
  });
  const up = () => { down = null; };
  sc.addEventListener('pointerup', up);
  sc.addEventListener('pointercancel', up);
  sc.addEventListener('dblclick', () => { auto = true; });
})();

function floatBar(it) {
  const segs = [['#3ddc5f', 0, 0.07], ['#a7e05a', 0.07, 0.15], ['#ffbf17', 0.15, 0.38], ['#ff8a3d', 0.38, 0.45], ['#de0607', 0.45, 1]];
  const bar = segs.map(([c, a, b]) => `<i style="width:${(b - a) * 100}%;background:${c}"></i>`).join('');
  const [lo, hi] = it.range;
  return `<div class="floatbar" aria-hidden="true">${bar}</div><div class="floatpin" aria-hidden="true"><span style="left:${lo * 100}%;width:${(hi - lo) * 100}%"></span><b style="left:${it.float * 100}%"></b></div>`;
}

function showItem(it, fresh) {
  const m = $('reveal');
  m.querySelector('.sheet').style.setProperty('--tc', tc(it.t));
  $('scene').style.setProperty('--tc', tc(it.t));
  $('rvTitle').textContent = fresh ? 'Tu as obtenu' : 'Objet de ton inventaire';
  buildModel(it);
  const c = data.cases.find((x) => x.id === it.caseId);
  const list = c ? pool(c, it.t) : [];
  const chance = list.length ? ODDS[it.t] / list.length : 0;
  const wp = it.range ? wearProbs(it.range).find((w) => w.id === it.wear) : null;
  $('specs').innerHTML = `
    <span class="rar" style="--tc:${tc(it.t)}">${TIER_INFO[it.t].name}</span>
    <h3>${it.st ? '<span style="color:#cf6a32">StatTrak™</span> ' : ''}${esc(it.n)}${it.ph ? ' · ' + esc(it.ph) : ''}</h3>
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
    <div class="btn2"><button class="btn-ghost" id="keep" type="button">Garder</button><button class="btn-main" id="sellOne" type="button">Vendre ${eur(it.value)}</button></div>`;
  $('keep').addEventListener('click', closeReveal);
  $('sellOne').addEventListener('click', () => sell(it.uid).then(closeReveal));
  m.hidden = false;
  auto = true; rotY = -25; rotX = 8;
  if (!raf) raf = requestAnimationFrame(spinLoop);
  $('keep').focus();
  stop3D();
  try3D(it);
}
function closeReveal() {
  stop3D();
  $('reveal').hidden = true;
  cancelAnimationFrame(raf); raf = 0; last = 0;
  $('model').innerHTML = '';
}
$('rvClose').addEventListener('click', closeReveal);
$('reveal').addEventListener('click', (e) => { if (e.target === $('reveal')) closeReveal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('reveal').hidden) closeReveal(); });

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
function renderInv() {
  const inv = casino.me.inventory || [];
  $('tabInv').textContent = `Inventaire (${inv.length})`;
  $('invSum').textContent = inv.length ? `${inv.length} objet${inv.length > 1 ? 's' : ''} · valeur ${eur(casino.me.inventoryValue || 0)}` : 'Inventaire vide : ouvre une caisse.';
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
