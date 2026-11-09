// Noyau commun à toutes les pages : joueur, solde, connexion au serveur, en-tête et dépôt simulé.
import { SERVER_URL } from './config.js';
import { run, newPlayer, score, inventoryValue, stocksValue, GameError, PACKS, GAMES, money, nextOpen, decodeHint, historyLabel } from './engine/games.js';
import { newMarket, advance, setMarks } from './engine/market.js';
import { view as bjView } from './engine/blackjack.js';
import { rng } from './engine/rng.js';
import { sfx } from './sound.js';
export { sfx };
import { pixelIcon, GAME_INFO } from './icons.js';

const KEY = 'croco-casino-v1';
const OLD_KEY = 'croco-plinko-eur';

export const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
export const nfx = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const eur = (n) => nf2.format(n) + ' €';
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const $ = (id) => document.getElementById(id);
export const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- état local ----------
function loadLocal() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!s || typeof s !== 'object') s = {};
  if (!s.token) {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    s.token = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  if (!s.p) {
    s.p = newPlayer();
    // Ancien Plinko : on reprend le solde, compté comme dépôt (il venait de dépôts simulés)
    try {
      const old = parseFloat(localStorage.getItem(OLD_KEY));
      if (isFinite(old) && old > 0) { s.p.balance = money(old); s.p.deposits = money(old); }
    } catch {}
  }
  s.p = { ...newPlayer(), ...s.p };
  return s;
}
const local = loadLocal();
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(local)); } catch {} }
saveLocal();

// ---------- évènements ----------
const listeners = {};
function emit(type, data) { (listeners[type] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); }

let caseListPromise = null;
export function loadCases() {
  if (!caseListPromise) caseListPromise = fetch('data/cases.json').then((r) => { if (!r.ok) throw new Error('cases'); return r.json(); });
  return caseListPromise;
}

function soloMe() {
  const p = local.p;
  return {
    name: local.name || 'Toi', balance: p.balance, deposits: p.deposits, score: score(p), rank: null,
    inventory: p.inventory, inventoryValue: inventoryValue(p), played: p.played, bj: bjView(p.bj),
    gifs: p.gifs || {}, spent: p.spent || 0, stocks: p.stocks || {}, stocksValue: stocksValue(p), bank: p.bank || 0,
  };
}
// Bourse en solo : le marché vit dans ce navigateur
function soloMarket() {
  if (!local.market) local.market = newMarket(Date.now());
  if (advance(local.market, Date.now(), rng)) saveLocal();
  setMarks(local.market.prices);
  return local.market;
}
// Ces actions n'ont pas d'animation : leur résultat s'affiche tout de suite
const NO_HOLD = ['wallet', 'work', 'gifs', 'stocks'];

export const casino = {
  online: !!SERVER_URL,
  status: SERVER_URL ? 'connecting' : 'solo', // solo | connecting | online | offline
  me: soloMe(),
  board: [],
  feed: [],
  round: null,
  table: [],
  duels: [],
  boards: [],
  onlineCount: 0,
  onlineNames: [],
  pending: 0, // gains pas encore montrés (animation en cours)
  on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return this; },

  // Joue une action. Renvoie le résultat ; le gain n'apparaît dans le solde affiché qu'après reveal().
  async play(game, action, params = {}) {
    let result, soloFeed = null;
    if (!this.online) {
      const ctx = { rng, caseList: game === 'cases' ? (await loadCases()).cases : [], now: Date.now() };
      if (game === 'stocks') ctx.prices = soloMarket().prices;
      try {
        const before = local.p.balance;
        const r = run(local.p, game, action, params, ctx);
        result = r.result;
        const d = money(local.p.balance - before);
        if (r.feed && r.feed.run) { // série auto de Plinko : une ligne d'historique et du fil pour toute la série
          let a = local.run;
          if (!a || a.run !== r.feed.run) a = local.run = { run: r.feed.run, n: 0, bet: 0, payout: 0, best: 0, h: null };
          a.n++; a.bet = money(a.bet + r.feed.bet); a.payout = money(a.payout + r.feed.payout); a.best = Math.max(a.best, r.feed.mult || 0);
          r.feed = { game, run: a.run, n: a.n, bet: a.bet, payout: a.payout, mult: a.best };
          local.hist = local.hist || [];
          const h = local.hist[local.hist.length - 1];
          if (h && h.run === a.run) Object.assign(h, { at: Date.now(), d: money(h.d + d), b: local.p.balance, l: historyLabel(game, action, params, result, r.feed) });
          else local.hist.push({ at: Date.now(), d, b: local.p.balance, l: historyLabel(game, action, params, result, r.feed), g: game, run: a.run });
        }
        soloFeed = r.feed ? { name: this.me.name, at: Date.now(), ...r.feed } : null;
        if (d && !(r.feed && r.feed.run)) {
          local.hist = local.hist || [];
          local.hist.push({ at: Date.now(), d, b: local.p.balance, l: historyLabel(game, action, params, result, r.feed), g: game });
          if (local.hist.length > 400) local.hist.splice(0, local.hist.length - 400);
        }
      } finally {
        saveLocal();
      }
      this.me = soloMe();
    } else {
      const res = await request({ t: 'req', game, action, params });
      result = res.result;
      this.me = res.me;
    }
    if (!NO_HOLD.includes(game)) { this.pending = money(this.pending + (result.payout || 0)); holding++; }
    if (soloFeed) addFeed(soloFeed);
    emit('me', this.me);
    renderWallet();
    return result;
  },
  // À appeler quand l'animation est finie : montre le gain et libère tes lignes du fil en direct.
  reveal(amount) {
    this.pending = Math.max(0, money(this.pending - (amount || 0)));
    holding = Math.max(0, holding - 1);
    if (!holding) { const h = held; held = []; h.reverse().forEach(showFeed); }
    renderWallet();
  },
  // Cours de la bourse (et historique d'une journée)
  async market() {
    if (!this.online) { const m = soloMarket(); return { prices: m.prices, hist: m.hist, news: m.news, t: m.t }; }
    const res = await request({ t: 'market' });
    setMarks(res.result.prices);
    return res.result;
  },
  // Tous les joueurs (ceux en ligne d'abord), pour choisir à qui envoyer un gif
  async players() {
    if (!this.online) return [{ name: this.me.name, online: true }];
    const list = (await request({ t: 'players' })).result;
    return list.sort((a, b) => b.online - a.online);
  },
  openDeposit() { openShop(); },
  // Parties plus anciennes d'un joueur (le profil n'envoie que les 400 dernières)
  async history(name, before) {
    if (!this.online) return [];
    return (await request({ t: 'hist', name, before })).result;
  },
  // Courbe du solde depuis « since » (0 = depuis le début), allégée par le serveur s'il y a beaucoup de points
  async curve(name, since) {
    if (this.online) return (await request({ t: 'curve', name, since })).result;
    return (local.hist || []).filter((h) => h.at >= since);
  },
  // Profit sur les jeux d'un joueur pendant les ms dernières millisecondes (dépôts, gifs et ajustements à part)
  async profit(name, ms) {
    if (this.online) return (await request({ t: 'profit', name, ms })).result;
    return soloProfit(ms);
  },
  removeGif(id) { if (this.online && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'gifrm', gid: id })); },
  // Image importée depuis l'appareil : envoyée au serveur, qui renvoie son adresse
  async uploadMedia(file) {
    if (!this.online) return URL.createObjectURL(file);
    const base = SERVER_URL.replace(/\/+$/, '');
    const r = await fetch(base + '/media', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new GameError(d.error || 'Envoi de l’image impossible.');
    return base + '/media/' + d.id;
  },
  serverUrl: SERVER_URL,
  // L'objet de la prochaine ouverture de cette caisse, tiré à l'avance, pour précharger sa 3D (sans le montrer).
  async peekNext(caseId) {
    if (!this.online) {
      const c = (await loadCases()).cases.find((x) => x.id === caseId);
      if (!c) return null;
      const it = nextOpen(local.p, c, rng);
      saveLocal();
      return it;
    }
    try {
      const res = await request({ t: 'req', game: 'cases', action: 'next', params: { caseId } });
      return decodeHint(res.result.hint);
    } catch { return null; } // hors ligne ou serveur ancien : pas de préchargement, sans gêner le jeu
  },
  // Profil d'un joueur (stats, inventaire, historique du solde)
  async profile(name) {
    if (this.online) return (await request({ t: 'profile', name })).result;
    const p = local.p;
    return {
      name: this.me.name, rank: null, score: score(p), balance: p.balance, deposits: p.deposits, inventoryValue: inventoryValue(p),
      played: p.played, inventory: [...p.inventory].sort((a, b) => b.value - a.value), hist: local.hist || [],
      profit: { m10: soloProfit(6e5), h1: soloProfit(36e5), h24: soloProfit(864e5) },
    };
  },
  // Pour un gain décidé par le serveur sans requête de ta part (tour de roulette partagé)
  hold(amount) { this.pending = money(this.pending + (amount || 0)); holding++; renderWallet(); },
  shownBalance() { return Math.max(0, money(this.me.balance - this.pending)); },
  nudgeDeposit() {
    const t = $('topup');
    if (!t) return;
    t.classList.remove('nudge'); void t.offsetWidth; t.classList.add('nudge');
  },
};

const soloProfit = (ms) => money((local.hist || []).filter((h) => h.at >= Date.now() - ms && !['wallet', 'admin', 'gifs'].includes(h.g)).reduce((s, h) => s + h.d, 0));

// Tes propres parties restent cachées du fil tant que leur animation n'est pas finie.
let holding = 0, held = [];
const sameRun = (e) => (x) => !(e.run && x.run === e.run && x.name === e.name); // série auto de Plinko : une seule ligne
function addFeed(e) {
  if (holding && e.name === casino.me.name) { held = held.filter(sameRun(e)); held.unshift(e); return; }
  showFeed(e);
}
function showFeed(e) {
  casino.feed = casino.feed.filter(sameRun(e));
  casino.feed.unshift(e);
  casino.feed.length = Math.min(casino.feed.length, 30);
  emit('feed', e);
}

// ---------- serveur ----------
let notedMatch = null;
let ws = null, reqId = 0, waiting = new Map(), retry = 0, everConnected = false;

function request(msg) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1 || casino.status !== 'online') { reject(new GameError('Hors ligne : reconnexion en cours…')); return; }
    const id = ++reqId;
    const timer = setTimeout(() => { waiting.delete(id); reject(new GameError('Le serveur ne répond pas.')); }, 10000);
    waiting.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ ...msg, id }));
  });
}

// Signe de vie toutes les 30 s tant que la page est visible : c'est ce qui te fait apparaître « en ligne »
let pingT = 0;
function ping() { if (ws && ws.readyState === 1 && document.visibilityState === 'visible') ws.send('{"t":"ping"}'); }
function startPing() {
  if (pingT) return;
  pingT = setInterval(ping, 30000);
  document.addEventListener('visibilitychange', ping);
}
function setStatus(s) { casino.status = s; emit('status', s); renderWallet(); }

function connect() {
  const url = SERVER_URL.replace(/\/+$/, '').replace(/^http/, 'ws') + '/ws';
  try { ws = new WebSocket(url); } catch { setStatus('offline'); return; }
  setStatus(everConnected ? 'offline' : 'connecting');
  // Le jeton de l'appareil suffit si ce téléphone s'est déjà connecté ; sinon le serveur envoie la liste des joueurs.
  ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', token: local.token })); };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'welcome') {
      everConnected = true; retry = 0;
      casino.me = m.me; casino.board = m.board; casino.boards = m.boards || []; casino.feed = m.feed; casino.round = m.round; casino.table = m.table; casino.onlineCount = m.online;
      casino.onlineNames = m.onlineNames || []; casino.duels = m.duels || [];
      local.name = m.me.name; saveLocal();
      closeLogin();
      setStatus('online');
      startPing();
      for (const d of casino.duels) if (d.to === m.me.name) { duelOffer(d); break; } // défi reçu pendant qu'on n'était pas là
      emit('me', m.me); emit('board', m.board); emit('boards', casino.boards); emit('feeds', m.feed); emit('round', m.round); emit('table', m.table); emit('online', m.online); emit('duels', casino.duels);
    } else if (m.t === 'login') {
      showLogin(m.players || [], m.error || '');
    } else if (m.t === 'res') {
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id); clearTimeout(w.timer);
      if (m.ok) w.resolve(m); else w.reject(new GameError(m.error));
    } else if (m.t === 'me') { casino.me = m.me; emit('me', m.me); renderWallet(); }
    else if (m.t === 'duelOffer') duelOffer(m.duel);
    else if (m.t === 'feed') addFeed(m.e);
    else if (m.t === 'feedAll') { casino.feed = m.feed; emit('feeds', m.feed); }
    else if (m.t === 'board') { casino.board = m.board; if (m.boards) casino.boards = m.boards; emit('board', m.board); emit('boards', casino.boards); }
    else if (m.t === 'round') { casino.round = m.round; emit('round', m.round); }
    else if (m.t === 'table') { casino.table = m.table; emit('table', m.table); }
    else if (m.t === 'online') { casino.onlineCount = m.n; casino.onlineNames = m.names || []; emit('online', m.n); }
    else if (m.t === 'gifs') emit('gifs', m);
    else if (m.t === 'crash') { casino.me = m.me; emit('crash', m.result); emit('me', m.me); renderWallet(); } // retrait auto : solde à jour tout de suite
    else if (m.t === 'duels') { casino.duels = m.duels; emit('duels', m.duels); }
    else if (m.t === 'duelEnd') { casino.me = m.me; emit('duelEnd', m.result); emit('me', m.me); renderWallet(); }
    else if (m.t === 'note') { toast(m.text); sfx.play('notify'); }
    else if (m.t === 'match') {
      // partie de chifoumi en cours : sur une autre page, on prévient une fois
      if (m.match.phase === 'play' && !/pfc\.html/.test(location.pathname) && notedMatch !== m.match.id) { notedMatch = m.match.id; toast(`Ta partie de chifoumi contre ${m.match.opp} t’attend dans Chifoumi`); }
      emit('match', m.match);
    }
  };
  ws.onclose = () => {
    for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new GameError('Connexion perdue.')); }
    waiting.clear();
    setStatus('offline');
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 1000 * retry);
  };
}

// ---------- connexion ----------
// Liste des joueurs : on clique sur son pseudo et on tape son code à 4 chiffres, une seule fois par appareil.
let loginList = [], loginPick = null, loginNew = false;
function sendAuth(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ ...msg, token: local.token })); }
function showLogin(players, error) {
  loginList = players;
  let box = $('loginBox');
  if (!box) {
    box = document.createElement('div');
    box.className = 'modal';
    box.id = 'loginBox';
    box.innerHTML = `
      <form class="sheet" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
        <div class="sheet-head"><h2 id="loginTitle">Qui joue ?</h2></div>
        <div class="step">
          <div class="who-list" id="whoList"></div>
          <button class="btn-ghost" id="whoNew" type="button">+ Nouveau</button>
          <div id="whoForm" class="who-form" hidden>
            <label class="field-head" for="whoName"><span>Pseudo</span></label>
            <input class="text-in" id="whoName" maxlength="16" autocomplete="nickname">
            <label class="field-head" for="whoPin"><span id="whoPinLabel">Code</span></label>
            <input class="otp" id="whoPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off">
            <p class="err" id="whoErr" aria-live="polite"></p>
            <button class="btn-main" type="submit" id="whoGo">Entrer</button>
          </div>
        </div>
      </form>`;
    document.body.appendChild(box);
    $('whoList').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-name]'); if (!b) return;
      pickLogin(b.dataset.name, false);
    });
    $('whoNew').addEventListener('click', () => pickLogin('', true));
    box.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = $('whoPin').value.replace(/\D/g, '');
      if (pin.length !== 4) { $('whoErr').textContent = 'Le code fait 4 chiffres.'; return; }
      if (loginNew) {
        const name = $('whoName').value.trim();
        if (name.length < 2) { $('whoErr').textContent = 'Pseudo : au moins 2 caractères.'; return; }
        sendAuth({ t: 'register', name, pin });
      } else {
        sendAuth({ t: 'login', name: loginPick, pin });
      }
      $('whoGo').disabled = true;
    });
  }
  $('whoList').innerHTML = players.length
    ? players.map((p) => `<button type="button" class="who-btn" data-name="${esc(p.name)}" aria-pressed="${p.name === loginPick}">${esc(p.name)}</button>`).join('')
    : '';
  box.hidden = false;
  $('whoGo').disabled = false;
  if (!players.length && !loginPick) pickLogin('', true);
  $('whoErr').textContent = error || '';
  if (error) $('whoPin').value = '';
}
function pickLogin(name, isNew) {
  loginPick = isNew ? null : name;
  loginNew = isNew;
  $('whoForm').hidden = false;
  $('whoName').hidden = !isNew;
  document.querySelector('label[for="whoName"]').hidden = !isNew;
  $('whoPinLabel').textContent = isNew ? 'Code (4 chiffres)' : 'Code';
  $('whoGo').textContent = isNew ? 'Créer' : 'Entrer';
  $('whoErr').textContent = '';
  $('whoPin').value = '';
  document.querySelectorAll('#whoList .who-btn').forEach((b) => b.setAttribute('aria-pressed', String(!isNew && b.dataset.name === name)));
  (isNew ? $('whoName') : $('whoPin')).focus();
}
function closeLogin() { const b = $('loginBox'); if (b) b.hidden = true; loginPick = null; }

// Changer de joueur sur cet appareil : on oublie son jeton et on revient à la liste
export function switchPlayer() {
  sendAuth({ t: 'logout' });
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  local.token = [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
  local.name = '';
  saveLocal();
  setStatus('connecting');
}

// ---------- en-tête ----------
export const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// La page reste cachée tant qu'elle n'est pas construite (sinon on voit une version à moitié faite pendant le chargement).
// Les pages qui attendent des données (caisses) passent { wait: true } et appellent pageReady() elles-mêmes.
let shellActive = '';
export function pageReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.add('ready');
    // Sur téléphone, en arrivant sur un jeu, on descend directement au jeu : le haut de page (logo, solde, menu des jeux)
    // reste juste au-dessus, il suffit de remonter.
    if (GAMES.includes(shellActive) && matchMedia('(max-width: 760px)').matches && scrollY < 5 && !location.hash) {
      const m = document.querySelector('main');
      if (m) scrollTo({ top: m.getBoundingClientRect().top + scrollY - 8, behavior: 'instant' });
    }
  }));
}
// Tant que la mise ne peut plus changer (fusée en vol, main de blackjack, bille qui roule…), ses réglages sont cachés
export function lockBet(on) { document.body.classList.toggle('betlock', !!on); }
export function mountShell(active, { wait = false } = {}) {
  shellActive = active;
  document.body.classList.toggle('is-game', GAMES.includes(active));
  if (!wait) pageReady();
  const top = document.createElement('header');
  top.className = 'top';
  const links = GAMES.map((g) => `<a href="${GAME_INFO[g].href}" title="${GAME_INFO[g].name}"${g === active ? ' aria-current="page"' : ''}>${pixelIcon(g, 18)}<span>${GAME_INFO[g].short || GAME_INFO[g].name}</span></a>`).join('');
  top.innerHTML = `
    <a class="brand" href="index.html"${active === 'home' ? ' aria-current="page"' : ''}>${pixelIcon('crown', 22)}<span>CROCO<br> CASINO</span></a>
    <nav class="nav" aria-label="Jeux">${links}<span class="nav-sep" aria-hidden="true"></span>
      <a href="travail.html" title="Travail (remplit ton compte en banque)"${active === 'work' ? ' aria-current="page"' : ''}>${pixelIcon('work', 18)}<span>Travail</span></a>
      <button type="button" id="gifBtn" title="Envoyer un gif à un joueur en ligne">${pixelIcon('gifs', 18)}<span>Gifs</span></button>
    </nav>
    <div class="wallet">
      <div>
        <div class="wallet-label">Solde <span class="net" id="net"></span></div>
        <div class="wallet-amount num"><span id="bal">0,00</span> <small>€</small></div>
      </div>
      <button class="me-btn" id="meBtn" type="button" title="Mon profil et paramètres" aria-label="Mon profil et paramètres"><span id="meIni">?</span></button>
      <button id="topup" class="topup" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        Déposer
      </button>
    </div>`;
  document.body.prepend(top);
  buildShop();
  $('topup').addEventListener('click', openShop);
  setupInstall();
  watchUpdates();
  // petit clic sur les boutons, au « click » et pas à l'appui : commencer un défilement sur un bouton ne fait pas de bruit
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button:not(:disabled), summary, a.tile, .nav a')) sfx.play('click', { gap: 60, vary: 0.08 }); }, true);
  $('gifBtn').addEventListener('click', () => import('./gifs.js?v=g1').then((g) => g.openGifSender()));
  import('./gifs.js?v=g1').then((g) => g.mountGifs()).catch((e) => console.error(e));
  $('meBtn').addEventListener('click', () => import('./profile.js').then((m) => m.openProfile(casino.me.name)));
  renderWallet();
  if (casino.online) connect();
  else setTimeout(() => { emit('me', casino.me); emit('feeds', casino.feed); }, 0);
}

function renderWallet() {
  const b = $('bal');
  if (b && !counting) b.textContent = nf2.format(casino.shownBalance());
  const n = $('net');
  if (n) {
    const s = casino.status;
    n.className = 'net ' + s;
    n.textContent = s === 'solo' ? 'Solo' : s === 'online' ? 'En ligne' : s === 'connecting' ? 'Connexion…' : 'Hors ligne';
    n.title = s === 'solo' ? 'Solo : aucun serveur configuré, ton solde reste dans ce navigateur.' : n.textContent;
  }
  // bouton profil : l'initiale du pseudo sur la couleur choisie pour sa carte
  const ini = $('meIni');
  if (ini) {
    ini.textContent = (casino.me.name || '?').trim().charAt(0).toUpperCase();
    $('meBtn').style.setProperty('--c', (casino.me.style && casino.me.style.color) || '#4b8cff');
    $('meBtn').title = `Mon profil et paramètres (${casino.me.name || ''})`;
  }
}

// ---------- dépôt simulé ----------
let counting = false, chosen = 1, lastFocus = null;
const STEPS = ['stepPack', 'stepPay', 'stepWait', 'stepOtp', 'stepDone'];

function buildShop() {
  const m = document.createElement('div');
  m.className = 'modal';
  m.id = 'shop';
  m.hidden = true;
  m.innerHTML = `
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="shopTitle">
    <div class="sheet-head"><h2 id="shopTitle">Déposer des fonds</h2><button class="x" id="shopClose" type="button" aria-label="Fermer">${X_ICON}</button></div>
    <form class="step" id="stepPack">
      <div class="steps-dots" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
      <div class="field-head"><span>Montant du dépôt</span></div>
      <div class="packs">${PACKS.map((p, i) => `<label class="pack">${i === 1 ? '<span class="tag">Populaire</span>' : ''}<input type="radio" name="pack" value="${i}"${i === chosen ? ' checked' : ''}><span class="cr">${nf0.format(p)} <small>€</small></span><span class="price">Crédité immédiatement</span></label>`).join('')}</div>
      <p class="bank-line"><span>Compte en banque : <b id="bankAmt">0,00 €</b></span><button class="btn-link small" id="packAll" type="button">Tout déposer</button></p>
      <p class="muted small">L’argent de la banque vient du travail du jour. <a href="travail.html">Aller travailler</a></p>
      <button class="btn-main" type="submit">Continuer</button>
    </form>
    <form class="step" id="stepPay" hidden>
      <div class="steps-dots" aria-hidden="true"><i class="on"></i><i class="on"></i><i></i></div>
      <dl class="summary"><div><dt>Dépôt</dt><dd id="sumHT">0,00 €</dd></div><div><dt>Frais</dt><dd>0,00 €</dd></div><div class="total"><dt>Total</dt><dd id="sumTTC">0,00 €</dd></div></dl>
      <div class="field-head"><span>Carte enregistrée</span></div>
      <label class="method"><input type="radio" name="method" value="card" checked><span><b>Carte •••• 4821</b><small>Expire 09/28</small></span></label>
      <div class="card" aria-label="Carte se terminant par 4821">
        <div class="card-top"><span>CROCO BANK</span><svg class="chip" viewBox="0 0 38 28" aria-hidden="true"><rect x="1" y="1" width="36" height="26" rx="5" fill="#ffbf17" stroke="#b07a00"/><path d="M1 10h12M1 18h12M25 10h12M25 18h12M13 1v26M25 1v26" stroke="#b07a00" fill="none"/></svg></div>
        <div class="card-num">5832 •••• •••• 4821</div>
        <div class="card-bottom"><span><small>TITULAIRE</small><span id="cardName"></span></span><span><small>EXPIRE</small>09/28</span></div>
      </div>
      <button class="btn-main" id="payBtn" type="submit">Payer</button>
      <button class="btn-link" id="backPack" type="button">Changer le montant</button>
      <p class="err small" id="payErr" aria-live="polite"></p>
    </form>
    <div class="step wait" id="stepWait" hidden><div class="spinner" aria-hidden="true"></div><p id="waitText" aria-live="polite">Connexion à la banque…</p></div>
    <form class="step" id="stepOtp" hidden>
      <div class="steps-dots" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i></div>
      <h3 class="h3">Confirme le paiement</h3>
      <p class="otp-hint">Entre n’importe quel code à 4 chiffres, par exemple <b>1234</b>.</p>
      <label for="otp" class="field-head"><span>Code de confirmation</span></label>
      <input class="otp" id="otp" type="text" inputmode="numeric" maxlength="6" autocomplete="off">
      <p class="err" id="otpErr" aria-live="polite"></p>
      <button class="btn-main" type="submit">Valider</button>
      <button class="btn-link" id="otpCancel" type="button">Annuler le paiement</button>
    </form>
    <div class="step done" id="stepDone" hidden>
      <svg class="done-ico" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="26" fill="#ffbf17"/><path d="M17 29l7 7 15-16" fill="none" stroke="#181818" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <h3 class="h3">Dépôt effectué</h3>
      <dl class="summary receipt"><div><dt>Transaction</dt><dd id="rcId">–</dd></div><div><dt>Date</dt><dd id="rcDate">–</dd></div><div><dt>Moyen</dt><dd>Carte •••• 4821</dd></div><div class="total"><dt>Montant déposé</dt><dd id="rcAmt">–</dd></div></dl>
      <button class="btn-main" id="doneBtn" type="button">Retour au jeu</button>
    </div>
    <p class="sheet-foot">Mode démo · argent fictif</p>
  </div>`;
  document.body.appendChild(m);

  const show = (id) => STEPS.forEach((s) => { $(s).hidden = s !== id; });
  m._show = show;
  $('shopClose').addEventListener('click', closeShop);
  m.addEventListener('click', (e) => { if (e.target === m) closeShop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden && $('stepWait').hidden) closeShop(); });
  $('stepPack').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = m.querySelector('input[name="pack"]:checked');
    chosen = c ? +c.value : 1;
    toPay();
  });
  // « Tout déposer » : tout l'argent du compte en banque
  $('packAll').addEventListener('click', () => { chosen = 'all'; toPay(); });
  const toPay = () => {
    const amt = chosen === 'all' ? (casino.me.bank || 0) : PACKS[chosen];
    $('sumHT').textContent = eur(amt);
    $('sumTTC').textContent = eur(amt);
    $('payBtn').textContent = 'Payer ' + eur(amt);
    show('stepPay');
    $('payBtn').focus();
  };
  $('backPack').addEventListener('click', () => show('stepPack'));
  $('stepPay').addEventListener('submit', (e) => {
    $('payErr').textContent = '';
    e.preventDefault();
    show('stepWait');
    $('waitText').textContent = 'Connexion à la banque…';
    setTimeout(() => { $('waitText').textContent = 'Autorisation…'; }, 800);
    setTimeout(() => { $('otp').value = ''; $('otpErr').textContent = ''; show('stepOtp'); $('otp').focus(); }, 1700);
  });
  $('stepOtp').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('otp').value.replace(/\D/g, '').length < 4) { $('otpErr').textContent = 'Le code fait au moins 4 chiffres.'; $('otp').focus(); return; }
    show('stepWait');
    $('waitText').textContent = 'Validation…';
    const before = casino.shownBalance();
    setTimeout(async () => {
      try {
        const r = await casino.play('wallet', 'deposit', { pack: chosen });
        $('rcId').textContent = 'DEP-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' + Math.floor(Math.random() * 900 + 100);
        $('rcDate').textContent = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
        $('rcAmt').textContent = eur(r.amount);
        show('stepDone');
        sfx.gain(true);
        $('doneBtn').focus();
        countUp(before, casino.shownBalance());
      } catch (err) {
        // Refus de la banque (plafond du jour) : retour à l'écran de paiement, message en petit rouge en bas
        show('stepPay');
        $('payErr').textContent = err.message;
      }
    }, 900);
  });
  $('otpCancel').addEventListener('click', () => show('stepPay'));
  $('doneBtn').addEventListener('click', closeShop);
}

const CARD_INITIAL = 'ABCDEFGHJKLMNPRSTV'[Math.floor(Math.random() * 18)];
function openShop() {
  $('bankAmt').textContent = eur(casino.me.bank || 0);
  $('cardName').textContent = `${CARD_INITIAL}. ${casino.me.name || 'Joueur'}`;
  const m = $('shop');
  lastFocus = document.activeElement;
  m.hidden = false;
  m._show('stepPack');
  $('payErr').textContent = '';
  (m.querySelector('input[name="pack"]:checked') || $('shopClose')).focus();
}
function closeShop() {
  $('shop').hidden = true;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function countUp(a, b) {
  const t0 = performance.now(), D = reduceMotion ? 1 : 900;
  counting = true;
  (function tick(now) {
    const t = Math.min(1, (now - t0) / D), v = a + (b - a) * (1 - Math.pow(1 - t, 3));
    $('bal').textContent = nf2.format(t < 1 ? v : casino.shownBalance());
    if (t < 1) requestAnimationFrame(tick); else { counting = false; renderWallet(); }
  })(t0);
}

// ---------- appli : installation sur l'écran d'accueil ----------
// Chrome propose d'installer le site (icône Croco Casino, plein écran) ; on affiche notre propre bandeau en bas.
// « Plus tard » le cache 3 jours. Sur iPhone, pas d'installation automatique : on explique le geste.
function setupInstall() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return; // déjà ouvert comme appli
  const KEY = 'croco-install-later';
  const snoozed = () => { try { return Date.now() < Number(localStorage.getItem(KEY) || 0); } catch { return false; } };
  const later = () => { try { localStorage.setItem(KEY, String(Date.now() + 3 * 86400000)); } catch {} };
  let deferred = null;
  const show = (ios) => {
    if ($('installBar') || snoozed()) return;
    const bar = document.createElement('div');
    bar.id = 'installBar';
    bar.className = 'install-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Installer l’appli');
    bar.innerHTML = `<img src="img/app/icon-192.png" alt="" width="44" height="44"><div><b>Installer Croco Casino</b><small>${ios ? 'Touche Partager, puis « Sur l’écran d’accueil ».' : 'L’appli sur ton écran d’accueil, en plein écran.'}</small></div>
      ${ios ? '' : '<button class="btn-main" type="button" id="installGo">Installer</button>'}<button class="x" type="button" id="installLater" aria-label="Plus tard">${X_ICON}</button>`;
    document.body.appendChild(bar);
    $('installLater').addEventListener('click', () => { later(); bar.remove(); });
    if (!ios) $('installGo').addEventListener('click', async () => {
      bar.remove();
      if (!deferred) return;
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => null);
      if (!r || r.outcome !== 'accepted') later();
      deferred = null;
    });
  };
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; show(false); });
  addEventListener('appinstalled', () => { const b = $('installBar'); if (b) b.remove(); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setTimeout(() => show(true), 1500);
}

// ---------- défi reçu au chifoumi : fenêtre Accepter / Refuser ----------
const seenOffers = new Set();
function duelOffer(d) {
  if (!d || seenOffers.has(d.id)) return;
  seenOffers.add(d.id);
  const old = $('duelOffer'); if (old) old.remove();
  const m = document.createElement('div');
  m.className = 'modal';
  m.id = 'duelOffer';
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="doTitle">
    <div class="sheet-head"><h2 id="doTitle">Défi au chifoumi</h2><button class="x" type="button" data-close aria-label="Fermer">${X_ICON}</button></div>
    <div class="step">
      <p class="duel-offer"><b>${esc(d.from)}</b> te défie en 3 points pour <b>${eur(d.bet)}</b>. Le gagnant prend les deux mises.</p>
      <div class="offer-btns"><button class="btn-pix no" type="button" data-no>Refuser</button><button class="btn-pix yes" type="button" data-yes>Accepter</button></div>
      <p class="muted small" id="doMsg">Tu peux toujours accepter plus tard depuis le menu Chifoumi.</p>
    </div></div>`;
  document.body.appendChild(m);
  sfx.play('notify');
  const close = () => m.remove();
  m.addEventListener('click', async (e) => {
    if (e.target === m || e.target.closest('[data-close]')) return close();
    const yes = e.target.closest('[data-yes]'), no = e.target.closest('[data-no]');
    if (!yes && !no) return;
    m.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      await casino.play('rps', yes ? 'accept' : 'decline', { id: d.id });
      casino.reveal(0);
      close();
      if (yes && !/pfc\.html/.test(location.pathname)) location.href = 'pfc.html';
      else if (no) toast(`Défi de ${d.from} refusé`);
    } catch (err) {
      $('doMsg').textContent = err.message;
      m.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  });
}

// ---------- mises à jour du site ----------
// Chaque publication change le numéro de version dans les liens des pages (casino.css?v=…).
// On compare celui de la page ouverte avec celui de l'accueil actuellement en ligne.
const pageVersion = () => { const l = document.querySelector('link[href*="casino.css"]'); const m = l && /[?&]v=([^&]+)/.exec(l.getAttribute('href')); return m ? m[1] : ''; };
let updateAvailable = false, lastCheck = 0;
export const hasUpdate = () => updateAvailable;
export async function checkUpdate(force = false) {
  if (!force && Date.now() - lastCheck < 60000) return updateAvailable;
  lastCheck = Date.now();
  try {
    const r = await fetch('index.html', { cache: 'no-store' });
    const m = /casino\.css\?v=([^"'&]+)/.exec(await r.text());
    const mine = pageVersion();
    updateAvailable = !!(m && mine && m[1] !== mine);
  } catch { /* hors ligne : on ne change rien */ }
  const b = $('meBtn'); if (b) b.classList.toggle('has-update', updateAvailable);
  return updateAvailable;
}
function watchUpdates() {
  setTimeout(() => checkUpdate(true), 4000);
  setInterval(() => { if (!document.hidden) checkUpdate(true); }, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
}

// ---------- paramètres ----------
// Forcer la mise à jour : on vide les copies gardées par l'appli et on recharge (le site redemande tout au serveur)
export async function forceUpdate() {
  try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } catch {}
  try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.update().catch(() => {}))); } catch {}
  location.reload();
}

// ---------- petit message en haut de l'écran ----------
export function toast(text, ms = 4500) {
  let box = $('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}
