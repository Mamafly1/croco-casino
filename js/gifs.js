// Gifs envoyés entre joueurs : ils s'affichent par-dessus le site, qui reste utilisable en dessous.
//  - DVD : rebondit sur les bords de l'écran ;
//  - Gravité : tombe, rebondit, s'empile (les gifs se poussent entre eux) et ne sort jamais seul de l'écran ;
//  - Plein écran : couvre tout pendant 20 s ; un appui long permet de le traîner, mais il revient en place.
// Pour jeter un petit gif : le prendre au doigt et le lancer hors de l'écran, ou le lâcher sur la poubelle en bas.
import { casino, $, esc, eur, toast, X_ICON } from './core.js';
import { GIF_PRICES, GIF_MODES, GIF_MAX_SEND } from './engine/games.js';

const CROCO = { id: 'croco', title: 'Croco', url: new URL('crocodile.gif', location.href).href, w: 240, h: 240 };
const SUGGEST = ['aura', 'tuff', 'brainrot']; // une suggestion sur trois vient de chaque recherche
const G = 2400, FULL_MS = 20000;

let layer = null, trash = null, raf = 0, last = 0, localId = -1;
const bodies = [];

// ---------- affichage ----------
export function mountGifs() {
  if (layer) return;
  layer = document.createElement('div');
  layer.className = 'giflayer';
  layer.setAttribute('aria-hidden', 'true');
  trash = document.createElement('div');
  trash.className = 'gif-trash';
  trash.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
  layer.appendChild(trash);
  document.body.appendChild(layer);
  casino.on('gifs', (m) => {
    if (m.note) toast(m.note);
    for (const g of m.add || []) addBody(g);
  });
  addEventListener('resize', () => { for (const b of bodies) if (b.mode !== 'full') keepIn(b); wake(); });
  setupFullDrag();
}

const vw = () => document.documentElement.clientWidth;
const vh = () => window.innerHeight;
function sizeFor(g) {
  const s = Math.max(80, Math.min(150, Math.min(vw(), vh()) * 0.28));
  const ar = g.w && g.h ? g.w / g.h : 1;
  return ar >= 1 ? [s, s / ar] : [s * ar, s];
}

function addBody(g) {
  const b = { id: g.id, mode: g.mode, x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0, held: false, flying: false, entered: false };
  const el = document.createElement('img');
  el.src = g.url;
  el.alt = '';
  el.draggable = false;
  el.className = 'gifbody ' + g.mode;
  b.el = el;
  if (g.mode === 'full') {
    const left = (g.expires || Date.now() + FULL_MS) - Date.now();
    if (left <= 0) { casino.removeGif(g.id); return; }
    b.ox = 0; b.oy = 0;
    bodies.push(b);
    layer.insertBefore(el, trash);
    setTimeout(() => dropBody(b, true), left);
    return;
  }
  [b.w, b.h] = sizeFor(g);
  el.style.width = b.w + 'px';
  el.style.height = b.h + 'px';
  const W = vw(), H = vh();
  b.x = Math.random() * Math.max(0, W - b.w);
  if (g.mode === 'dvd') {
    b.y = Math.random() * Math.max(0, H - b.h);
    const a = (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.6);
    const sp = 150 + Math.random() * 60;
    b.vx = Math.cos(a) * sp * (Math.random() < 0.5 ? 1 : -1);
    b.vy = Math.sin(a) * sp;
  } else {
    b.y = -b.h - Math.random() * H * 0.6;
    b.vx = (Math.random() - 0.5) * 160;
  }
  grabbable(b);
  bodies.push(b);
  layer.insertBefore(el, trash);
  draw(b);
  wake();
}

function dropBody(b, notify) {
  const i = bodies.indexOf(b);
  if (i < 0) return;
  bodies.splice(i, 1);
  b.el.classList.add('gone');
  setTimeout(() => b.el.remove(), 300);
  if (notify) casino.removeGif(b.id);
}
function draw(b) { b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`; }
function keepIn(b) {
  const W = vw(), H = vh();
  b.x = Math.max(0, Math.min(W - b.w, b.x));
  b.y = Math.min(H - b.h, b.y);
  if (b.entered || b.mode === 'dvd') b.y = Math.max(0, b.y);
}

function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } }
function step(now) {
  raf = 0;
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  const W = vw(), H = vh();
  let moving = false;
  const grav = [];
  for (const b of bodies.slice()) {
    if (b.mode === 'full' || b.held) continue;
    if (b.flying) {
      // lancé hors de l'écran : il part pour de bon
      b.vy += (b.mode === 'gravity' ? G : 0) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      draw(b);
      if (b.x > W + 40 || b.x + b.w < -40 || b.y > H + 40 || b.y + b.h < -40) dropBody(b, true);
      moving = true;
      continue;
    }
    if (b.mode === 'dvd') {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx); }
      if (b.x + b.w > W) { b.x = W - b.w; b.vx = -Math.abs(b.vx); }
      if (b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy); }
      if (b.y + b.h > H) { b.y = H - b.h; b.vy = -Math.abs(b.vy); }
      draw(b);
      moving = true;
      continue;
    }
    b.vy += G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    grav.push(b);
  }
  // gravité : chocs entre gifs (boîtes un peu réduites, leurs bords sont souvent transparents)
  const all = bodies.filter((b) => b.mode === 'gravity' && !b.flying);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) collide(all[i], all[j]);
    }
    for (const b of grav) walls(b, W, H);
  }
  for (const b of grav) {
    if (b.y >= 0) b.entered = true;
    draw(b);
    if (Math.abs(b.vx) > 4 || Math.abs(b.vy) > 4 || b.y + b.h < H - 2 && !restingOnSomething(b, all)) moving = true;
  }
  if (moving || bodies.some((b) => b.held)) raf = requestAnimationFrame(step);
}
function restingOnSomething(b, all) {
  return all.some((o) => o !== b && Math.abs(o.y - (b.y + b.h * 0.92)) < 12 && o.x < b.x + b.w * 0.9 && o.x + o.w * 0.9 > b.x);
}
function walls(b, W, H) {
  if (b.y + b.h > H) { b.y = H - b.h; b.vy = Math.abs(b.vy) > 120 ? -b.vy * 0.35 : 0; b.vx *= 0.92; }
  if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * 0.4; }
  if (b.x + b.w > W) { b.x = W - b.w; b.vx = -Math.abs(b.vx) * 0.4; }
  if (b.entered && b.y < 0) { b.y = 0; b.vy = Math.abs(b.vy) * 0.3; }
}
function collide(a, b) {
  const s = 0.08; // marge transparente
  const ax0 = a.x + a.w * s, ax1 = a.x + a.w * (1 - s), ay0 = a.y + a.h * s, ay1 = a.y + a.h * (1 - s);
  const bx0 = b.x + b.w * s, bx1 = b.x + b.w * (1 - s), by0 = b.y + b.h * s, by1 = b.y + b.h * (1 - s);
  const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0), oy = Math.min(ay1, by1) - Math.max(ay0, by0);
  if (ox <= 0 || oy <= 0) return;
  const ka = a.held ? 0 : b.held ? 1 : 0.5, kb = 1 - ka;
  if (ox < oy) {
    const d = (a.x + a.w / 2 < b.x + b.w / 2 ? -1 : 1) * ox;
    a.x += d * ka; b.x -= d * kb;
    const v = (a.vx + b.vx) / 2; a.vx = a.held ? a.vx : v * 0.8; b.vx = b.held ? b.vx : v * 0.8;
  } else {
    const d = (a.y + a.h / 2 < b.y + b.h / 2 ? -1 : 1) * oy;
    a.y += d * ka; b.y -= d * kb;
    const v = (a.vy + b.vy) / 2; if (!a.held) a.vy = v * 0.6; if (!b.held) b.vy = v * 0.6;
    // petit glissement sur le côté pour que la pile s'étale au lieu de tenir en équilibre
    const side = (a.x + a.w / 2) - (b.x + b.w / 2);
    if (Math.abs(side) < 2) { if (!a.held) a.vx += (Math.random() - 0.5) * 40; } else if (d < 0 && !a.held) a.vx += Math.sign(side) * 30; else if (!b.held) b.vx -= Math.sign(side) * 30;
  }
}

// ---------- prise en main des petits gifs ----------
function forwardClick(x, y, el) {
  // un appui sans bouger passe au site en dessous (le gif ne bloque rien)
  el.style.visibility = 'hidden';
  const t = document.elementFromPoint(x, y);
  el.style.visibility = '';
  if (!t) return;
  if (t.matches('input, textarea, select')) t.focus();
  t.click();
}
function overTrash(x, y) {
  const r = trash.getBoundingClientRect();
  return x > r.left - 24 && x < r.right + 24 && y > r.top - 24 && y < r.bottom + 24;
}
function grabbable(b) {
  const el = b.el;
  let start = null, track = [], showTimer = 0;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY, t: performance.now(), ox: e.clientX - b.x, oy: e.clientY - b.y, moved: false };
    track = [[e.clientX, e.clientY, performance.now()]];
    b.held = true; b.flying = false; b.vx = 0; b.vy = 0;
    el.classList.add('held');
    showTimer = setTimeout(() => layer.classList.add('dragging'), 180);
    wake();
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) start.moved = true;
    b.x = e.clientX - start.ox; b.y = e.clientY - start.oy;
    draw(b);
    track.push([e.clientX, e.clientY, performance.now()]);
    if (track.length > 6) track.shift();
    trash.classList.toggle('hot', overTrash(e.clientX, e.clientY));
  });
  const up = (e) => {
    if (!start) return;
    clearTimeout(showTimer);
    layer.classList.remove('dragging');
    trash.classList.remove('hot');
    el.classList.remove('held');
    b.held = false;
    const s = start; start = null;
    if (!s.moved && performance.now() - s.t < 350) { forwardClick(e.clientX, e.clientY, el); wake(); return; }
    if (overTrash(e.clientX, e.clientY)) { dropBody(b, true); return; }
    const [x0, y0, t0] = track[0], [x1, y1, t1] = track[track.length - 1];
    const dt = Math.max(16, t1 - t0) / 1000;
    const vx = (x1 - x0) / dt, vy = (y1 - y0) / dt;
    const W = vw(), H = vh();
    const outside = b.x + b.w * 0.5 < 0 || b.x + b.w * 0.5 > W || b.y + b.h * 0.5 < 0 || b.y + b.h * 0.5 > H;
    if (outside || Math.hypot(vx, vy) > 1500) { b.flying = true; b.vx = vx; b.vy = vy; }
    else if (b.mode === 'dvd') {
      const sp = Math.max(150, Math.min(400, Math.hypot(vx, vy)));
      const a = Math.hypot(vx, vy) > 60 ? Math.atan2(vy, vx) : Math.atan2(b.vy || 1, b.vx || 1);
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      keepIn(b);
    } else { b.vx = Math.max(-900, Math.min(900, vx)); b.vy = Math.max(-1400, Math.min(1400, vy)); b.entered = true; keepIn(b); }
    wake();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

// ---------- plein écran : appui long pour le traîner, il revient toujours en place ----------
function setupFullDrag() {
  let timer = 0, start = null, drag = null;
  const top = () => { const f = bodies.filter((b) => b.mode === 'full'); return f[f.length - 1]; };
  document.addEventListener('pointerdown', (e) => {
    if (!top() || e.target.closest('.gifbody, .modal')) return;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => {
      const b = top();
      if (!b || !start) return;
      drag = { b, x: start.x, y: start.y };
      b.el.classList.add('held');
      b.el.style.transition = 'none';
      if (navigator.vibrate) navigator.vibrate(15);
    }, 380);
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (start && !drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { clearTimeout(timer); start = null; }
    if (!drag) return;
    // élastique : il suit le doigt mais de moins en moins, et ne quitte jamais l'écran
    const rub = (d, max) => (max * d) / (Math.abs(d) + max);
    const dx = rub(e.clientX - drag.x, vw() * 0.3), dy = rub(e.clientY - drag.y, vh() * 0.3);
    drag.b.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(0.97)`;
  }, true);
  const end = () => {
    clearTimeout(timer); start = null;
    if (!drag) return;
    const b = drag.b; drag = null;
    b.el.classList.remove('held');
    b.el.style.transition = '';
    b.el.style.transform = '';
    // l'appui long ne doit pas cliquer sur le bouton en dessous
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, true), 400);
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', end, true);
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false, capture: true });
  document.addEventListener('contextmenu', (e) => { if (drag || (top() && start)) e.preventDefault(); }, true);
}

// ---------- fenêtre d'envoi ----------
let picked = null, mode = 'gravity', qty = 3, search = { q: '', page: 0, busy: false, more: true }, playersCache = null;

function api(q, page, per) {
  if (!casino.serverUrl) return Promise.reject(new Error('La recherche de gifs a besoin du serveur.'));
  return fetch(`${casino.serverUrl.replace(/\/+$/, '')}/gifs?q=${encodeURIComponent(q)}&page=${page}&per=${per}`)
    .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Recherche impossible.'); return d; });
}

function box() {
  let m = $('gifBox');
  if (m) return m;
  m = document.createElement('div');
  m.className = 'modal';
  m.id = 'gifBox';
  m.hidden = true;
  m.innerHTML = `<div class="sheet wide gifsheet" role="dialog" aria-modal="true" aria-labelledby="gifTitle">
    <div class="sheet-head"><h2 id="gifTitle">Envoyer un gif</h2><button class="x" id="gifClose" type="button" aria-label="Fermer">${X_ICON}</button></div>
    <div class="step gifstep">
      <div class="field"><label class="field-head" for="gifTo"><span>À qui ?</span></label><select class="text-in" id="gifTo"></select></div>
      <form class="gif-search" id="gifForm" role="search">
        <input class="text-in" id="gifQ" type="search" placeholder="Rechercher un gif…" enterkeyhint="search" autocomplete="off">
        <button class="gif-plus" id="gifPlus" type="button" aria-label="Importer un gif ou une image" aria-expanded="false" aria-controls="gifMenu">+</button>
        <div class="gif-menu" id="gifMenu" hidden>
          <button type="button" id="gifFile">Importer un gif / une image</button>
          <button type="button" id="gifLink">Lien d’un gif / d’une image</button>
        </div>
        <input type="file" id="gifFileIn" accept="image/*" hidden>
      </form>
      <h3 class="h-label" id="gifListTitle">Gifs proposés</h3>
      <div class="gif-grid" id="gifGrid"></div>
      <p class="muted small" id="gifErr" aria-live="polite"></p>
      <button class="btn-ghost" id="gifMore" type="button">Chercher plus</button>
    </div>
    <div class="gif-send" id="gifSend" hidden>
      <div class="gif-pick"><img id="gifPrev" alt=""><div><b id="gifName"></b><small class="muted" id="gifStock"></small></div></div>
      <div class="seg" id="gifMode" role="group" aria-label="Mode d’apparition">${Object.entries(GIF_MODES).map(([k, n]) => `<button type="button" data-mode="${k}" aria-pressed="${k === mode}">${n}<small>${eur(GIF_PRICES[k])}</small></button>`).join('')}</div>
      <div class="gif-qty"><span>Quantité</span><button type="button" id="gifMinus" aria-label="Moins">−</button><input id="gifQty" inputmode="numeric" value="${qty}" aria-label="Quantité"><button type="button" id="gifPlusQ" aria-label="Plus">+</button></div>
      <p class="gif-cost" id="gifCost"></p>
      <div class="btn2"><button class="btn-ghost" id="gifBuy" type="button">Mettre en stock</button><button class="btn-main" id="gifGo" type="button">Envoyer</button></div>
    </div>
  </div>`;
  document.body.appendChild(m);
  const close = () => { m.hidden = true; };
  $('gifClose').addEventListener('click', close);
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) close(); });
  $('gifForm').addEventListener('submit', (e) => { e.preventDefault(); $('gifQ').blur(); startList($('gifQ').value.trim()); });
  $('gifQ').addEventListener('search', () => { if (!$('gifQ').value) startList(''); });
  $('gifPlus').addEventListener('click', () => {
    const open = $('gifMenu').hidden;
    $('gifMenu').hidden = !open;
    $('gifPlus').setAttribute('aria-expanded', String(open));
  });
  $('gifFile').addEventListener('click', () => { $('gifMenu').hidden = true; $('gifFileIn').click(); });
  $('gifFileIn').addEventListener('change', async () => {
    const f = $('gifFileIn').files[0];
    $('gifFileIn').value = '';
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) { $('gifErr').textContent = 'Image trop lourde (1,5 Mo max).'; return; }
    $('gifErr').textContent = 'Envoi de l’image…';
    try {
      const url = await casino.uploadMedia(f);
      $('gifErr').textContent = '';
      choose({ id: 'file', title: f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'image', url });
    } catch (e) { $('gifErr').textContent = e.message; }
  });
  $('gifLink').addEventListener('click', () => {
    $('gifMenu').hidden = true;
    const u = (prompt('Colle le lien du gif ou de l’image :') || '').trim();
    if (!u) return;
    if (!/^https?:\/\/\S+$/.test(u)) { $('gifErr').textContent = 'Ce n’est pas un lien valide.'; return; }
    const name = decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || 'gif').replace(/\.[^.]+$/, '').slice(0, 40) || 'gif';
    choose({ id: 'link', title: name, url: u });
  });
  $('gifGrid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) choose(gridItems[+b.dataset.i], b);
  });
  $('gifMore').addEventListener('click', () => more());
  $('gifMode').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]'); if (!b) return;
    mode = b.dataset.mode;
    m.querySelectorAll('#gifMode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    cost();
  });
  const setQty = (v) => { qty = Math.max(1, Math.min(GIF_MAX_SEND, Math.round(Number(v)) || 1)); $('gifQty').value = qty; cost(); };
  $('gifMinus').addEventListener('click', () => setQty(qty - 1));
  $('gifPlusQ').addEventListener('click', () => setQty(qty + 1));
  $('gifQty').addEventListener('change', () => setQty($('gifQty').value));
  $('gifBuy').addEventListener('click', async () => {
    try {
      await casino.play('gifs', 'buy', { mode, qty });
      toast(`${qty}× ${GIF_MODES[mode]} mis en stock`);
      cost();
    } catch (e) { $('gifCost').textContent = e.message; }
  });
  $('gifGo').addEventListener('click', send);
  casino.on('me', () => { if (!m.hidden) cost(); });
  return m;
}

let gridItems = [];
function renderGrid(items, append) {
  if (!append) gridItems = [];
  const start = gridItems.length;
  gridItems.push(...items);
  const html = items.map((g, k) => `<button type="button" class="gif-cell" data-i="${start + k}" aria-label="${esc(g.title)}"><img src="${esc(g.preview || g.url)}" alt="" loading="lazy"></button>`).join('');
  if (append) $('gifGrid').insertAdjacentHTML('beforeend', html); else $('gifGrid').innerHTML = html;
}
async function startList(q) {
  search = { q, page: 0, busy: false, more: true };
  $('gifListTitle').textContent = q ? `Résultats pour « ${q} »` : 'Gifs proposés';
  renderGrid(q ? [] : [CROCO], false);
  await more();
}
async function more() {
  if (search.busy) return;
  search.busy = true;
  const my = search;
  $('gifMore').disabled = true;
  $('gifErr').textContent = '';
  try {
    const page = my.page + 1;
    let items;
    if (my.q) items = (await api(my.q, page, 24)).items;
    else {
      // suggestions : aura, tuff, brainrot, aura, tuff… (7 de chaque, une vingtaine en tout)
      const lists = await Promise.all(SUGGEST.map((q) => api(q, page, 7).then((d) => d.items).catch((e) => { if (page === 1 && q === SUGGEST[0]) throw e; return []; })));
      items = [];
      for (let i = 0; i < 7; i++) for (const l of lists) if (l[i]) items.push(l[i]);
    }
    if (my !== search) return;
    my.page = page;
    renderGrid(items, true);
    if (!items.length) $('gifErr').textContent = my.q ? 'Aucun gif trouvé.' : '';
  } catch (e) {
    if (my === search) $('gifErr').textContent = e.message;
  } finally {
    my.busy = false;
    $('gifMore').disabled = false;
  }
}

function choose(g, btn) {
  picked = { ...g };
  document.querySelectorAll('#gifGrid .gif-cell').forEach((x) => x.classList.toggle('on', x === btn));
  $('gifSend').hidden = false;
  $('gifPrev').src = g.preview || g.url;
  $('gifName').textContent = g.title;
  if (!g.w || !g.h) {
    const im = new Image();
    im.onload = () => { if (picked && picked.url === g.url) { picked.w = im.naturalWidth; picked.h = im.naturalHeight; } };
    im.src = g.url;
  }
  cost();
}
function cost() {
  if (!$('gifSend') || $('gifSend').hidden) return;
  const stock = (casino.me.gifs || {})[mode] || 0;
  const pay = Math.max(0, qty - stock) * GIF_PRICES[mode];
  $('gifStock').textContent = `En stock : ${Object.entries(GIF_MODES).map(([k, n]) => `${n} ${(casino.me.gifs || {})[k] || 0}`).join(' · ')}`;
  $('gifCost').textContent = stock >= qty ? `Pris dans ton stock (${stock} ${GIF_MODES[mode]}) : gratuit` : `${stock ? `${stock} pris dans ton stock, à payer` : 'À payer'} : ${eur(pay)}`;
  $('gifBuy').textContent = `Mettre ${qty} en stock (${eur(qty * GIF_PRICES[mode])})`;
}
async function send() {
  const to = $('gifTo').value;
  if (!picked || !to) return;
  $('gifGo').disabled = true;
  try {
    const gif = { url: picked.url, name: picked.title, w: picked.w || 0, h: picked.h || 0 };
    const r = await casino.play('gifs', 'send', { to, mode, qty, gif });
    if (!casino.online) addLocal(gif);
    toast(`${qty}× ${picked.title} envoyé${qty > 1 ? 's' : ''} à ${r.to || to}`);
    $('gifBox').hidden = true;
  } catch (e) { $('gifCost').textContent = e.message; }
  finally { $('gifGo').disabled = false; }
}
// Mode solo : on s'envoie le gif à soi-même
function addLocal(gif) {
  for (let i = 0; i < qty; i++) addBody({ id: localId--, mode, url: gif.url, name: gif.name, w: gif.w, h: gif.h, expires: mode === 'full' ? Date.now() + FULL_MS : 0 });
}

export async function openGifSender(toName = '') {
  const m = box();
  m.hidden = false;
  $('gifSend').hidden = true;
  $('gifMenu').hidden = true;
  $('gifErr').textContent = '';
  $('gifQ').value = '';
  try {
    playersCache = await casino.players();
  } catch { playersCache = playersCache || [{ name: casino.me.name, online: true }]; }
  const me = casino.me.name;
  // seulement les joueurs en ligne (toi compris, pour tester)
  const on = playersCache.filter((p) => p.online || p.name === me);
  $('gifTo').innerHTML = on.map((p) => `<option value="${esc(p.name)}">● ${esc(p.name)}${p.name === me ? ' (toi)' : ''}</option>`).join('');
  const def = (toName && on.some((p) => p.name === toName) && toName) || (on.find((p) => p.name !== me) || {}).name || me;
  $('gifTo').value = def;
  startList('');
}
