// Serveur multijoueur de Croco Casino : un Worker Cloudflare + un Durable Object (stockage SQLite).
// Le site reste sur GitHub Pages ; il se connecte ici en WebSocket quand js/config.js donne l'adresse.
import { DurableObject } from 'cloudflare:workers';
import { run, newPlayer, score, inventoryValue, stocksValue, readRouletteBets, readBet, GameError, money, GAMES, historyLabel, rpsOutcome, RPS_MOVES, GIF_MODES } from '../../js/engine/games.js';
import { newMarket, advance, setMarks } from '../../js/engine/market.js';
import { timeTo } from '../../js/engine/crash.js';
import { workDay } from '../../js/engine/work.js';
import * as roulette from '../../js/engine/roulette.js';
import { view as bjView } from '../../js/engine/blackjack.js';
import { rng } from '../../js/engine/rng.js';
import caseData from '../../data/cases.json';

const BET_MS = 15000;   // durée des mises d'un tour de roulette
const SHOW_MS = 10000;  // affichage du résultat avant le tour suivant
const ROUND_MS = 30000;   // temps pour jouer une manche de chifoumi entre joueurs
const WIN_POINTS = 3;     // points pour gagner une partie de chifoumi
// Couleurs possibles pour sa carte au classement (sinon : couleur du rang)
// Plusieurs nuances par couleur, toutes différentes des couleurs de rang ; une couleur n'appartient qu'à un joueur
const CARD_COLORS = [
  '#8ab4ff', '#1e5bd8', '#6fd3ff', // bleus
  '#ffb3d9', '#c2187a', '#ff8fa3', // roses
  '#ffe066', '#ff8c1a', '#c99700', // jaunes et orange
  '#ff6b6b', '#a30d0d', '#ff4f1f', // rouges
  '#a8f07a', '#138a36', '#00c9a7', // verts
  '#c7a3ff', '#7a3dff', '#d94dff', // violets
  '#f0f0e6', '#9a9a90', // blanc et gris
];
// Classements secondaires : chacun a un titre, donné à celui qui est en tête
const BOARDS = [
  { key: 'win', label: 'Le plus gros gain en une seule partie', col: 'GAIN', title: 'Le Gros Coup', unit: 'eur' },
  { key: 'mult', label: 'Le plus gros multiplicateur gagné (×)', col: 'MULTI', title: 'Kamikaze', unit: 'x' },
  { key: 'rps', label: 'Parties de chifoumi gagnées', col: 'VICTOIRES', title: 'Maître Caillou', unit: 'n' },
  { key: 'tasks', label: 'Tâches de travail réussies', col: 'TÂCHES', title: 'Le Stagiaire', unit: 'n' },
  { key: 'stock', label: 'Argent gagné en revendant des actions', col: 'GAINS', title: 'Yomi Denzel', unit: 'eur' },
  { key: 'gifts', label: 'Argent dépensé en gifs', col: 'DÉPENSÉ', title: 'Sonion', unit: 'eur' },
  { key: 'parties', label: 'Nombre de parties jouées', col: 'PARTIES', title: 'The Gambler', unit: 'n' },
];
const NAME_RE = /^[\p{L}\p{N} _.\-]{2,16}$/u;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/admin') return adminRoute(request, env);
    if (url.pathname === '/gifs') return gifRoute(request, env, ctx, url);
    if (url.pathname === '/media' || url.pathname.startsWith('/media/')) return mediaRoute(request, env, url);
    if (url.pathname !== '/ws') return new Response('Croco Casino : rien ici.', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    if (allowed.length && !allowed.includes(origin)) return new Response('Origine refusée', { status: 403 });
    const stub = env.CASINO.get(env.CASINO.idFromName('main'));
    return stub.fetch(request);
  },
};

// Panneau admin : requêtes POST depuis admin.html, protégées par le secret ADMIN_KEY
function cors(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': !allowed.length || allowed.includes(origin) ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
async function adminRoute(request, env) {
  const h = cors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') return new Response('POST attendu', { status: 405, headers: h });
  const stub = env.CASINO.get(env.CASINO.idFromName('main'));
  const res = await stub.fetch(new Request('https://do/admin', { method: 'POST', body: await request.text() }));
  return new Response(res.body, { status: res.status, headers: { ...h, 'Content-Type': 'application/json' } });
}

// ---------- gifs : recherche Klipy (la clé reste sur le serveur, secret KLIPY_KEY) ----------
function json(status, obj, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
function getCors(request, env) { return { ...cors(request, env), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }; }
async function gifRoute(request, env, ctx, url) {
  const h = getCors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (!env.KLIPY_KEY) return json(503, { error: 'Recherche de gifs pas encore configurée (secret KLIPY_KEY).' }, h);
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);
  const page = Math.max(1, Math.min(50, parseInt(url.searchParams.get('page'), 10) || 1));
  const per = Math.max(1, Math.min(48, parseInt(url.searchParams.get('per'), 10) || 24));
  const cacheKey = new Request(`https://cache.croco/gifs?q=${encodeURIComponent(q.toLowerCase())}&page=${page}&per=${per}`);
  const cache = caches.default;
  let res = await cache.match(cacheKey);
  if (!res) {
    const qs = new URLSearchParams({ page: String(page), per_page: String(per), customer_id: 'croco-casino', locale: 'fr' });
    if (q) qs.set('q', q);
    const api = `https://api.klipy.com/api/v1/${encodeURIComponent(env.KLIPY_KEY)}/gifs/${q ? 'search' : 'trending'}?${qs}`;
    let data;
    try {
      const r = await fetch(api, { headers: { Accept: 'application/json' } });
      if (!r.ok) return json(502, { error: `Klipy ne répond pas (${r.status}).` }, h);
      data = await r.json();
    } catch { return json(502, { error: 'Klipy ne répond pas.' }, h); }
    res = json(200, klipyItems(data), { 'Cache-Control': 'public, max-age=1800' });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return new Response(res.body, { status: res.status, headers: { ...h, 'Content-Type': 'application/json' } });
}
// Réponse Klipy -> { items: [{ id, title, url, preview, w, h }], hasNext }. Lecture prudente : plusieurs formes possibles.
function klipyItems(d) {
  const box = d && typeof d.data === 'object' && d.data !== null ? d.data : d || {};
  const list = Array.isArray(box) ? box : Array.isArray(box.data) ? box.data : Array.isArray(d && d.results) ? d.results : [];
  const items = [];
  for (const it of list) {
    if (!it || typeof it !== 'object' || it.type === 'ad') continue;
    const f = it.file || it.files || it.media_formats || {};
    const find = (sizes, fmts) => {
      for (const sz of sizes) for (const fm of fmts) {
        const x = (f[sz] && f[sz][fm]) || (sz === fm ? f[fm] : null);
        if (x && x.url) return x;
      }
      return null;
    };
    const main = find(['md', 'hd', 'sm', 'gif', 'mediumgif'], ['gif', 'webp']) || find(['tinygif', 'nanogif'], ['tinygif', 'nanogif']);
    const prev = find(['sm', 'xs', 'md'], ['gif', 'webp']) || find(['tinygif'], ['tinygif']) || main;
    if (!main) continue;
    const dims = Array.isArray(main.dims) ? main.dims : [main.width, main.height];
    items.push({ id: String(it.id ?? it.slug ?? main.url), title: String(it.title || it.content_description || it.slug || 'gif').slice(0, 60),
      url: main.url, preview: prev.url, w: Number(dims[0]) || 0, h: Number(dims[1]) || 0 });
  }
  const out = { items, hasNext: box.has_next !== undefined ? !!box.has_next : items.length > 0 };
  if (!items.length && list.length) out.debug = Object.keys(list[0]); // forme inconnue : aide au diagnostic
  return out;
}
// Images importées depuis le téléphone : gardées dans le stockage du serveur
async function mediaRoute(request, env, url) {
  const h = getCors(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const stub = env.CASINO.get(env.CASINO.idFromName('main'));
  if (request.method === 'POST' && url.pathname === '/media') {
    const type = request.headers.get('Content-Type') || '';
    if (!/^image\/(gif|png|jpeg|webp)$/.test(type)) return json(415, { error: 'Seulement des images (gif, png, jpg, webp).' }, h);
    const body = await request.arrayBuffer();
    if (body.byteLength > 1.5 * 1024 * 1024) return json(413, { error: 'Image trop lourde (1,5 Mo max).' }, h);
    const res = await stub.fetch(new Request('https://do/media', { method: 'POST', body, headers: { 'Content-Type': type } }));
    return new Response(res.body, { status: res.status, headers: { ...h, 'Content-Type': 'application/json' } });
  }
  if (request.method === 'GET') {
    const res = await stub.fetch(new Request('https://do' + url.pathname));
    return new Response(res.body, { status: res.status, headers: { ...h, 'Content-Type': res.headers.get('Content-Type') || 'text/plain', 'Cache-Control': res.ok ? 'public, max-age=31536000, immutable' : 'no-store' } });
  }
  return json(405, { error: 'Méthode non autorisée.' }, h);
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const colorOf = (style) => { try { return JSON.parse(style || '{}').color || null; } catch { return null; } };
const totalPlayed = (p) => Object.values(p.played || {}).reduce((a, b) => a + b, 0);

export class Casino extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      token TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      games TEXT NOT NULL DEFAULT '[]',
      created INTEGER NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS players_score ON players(score DESC)');
    // Comptes : un code à 4 chiffres par joueur, et un jeton par appareil (le site s'en souvient)
    this.sql.exec('CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, player_id INTEGER NOT NULL, created INTEGER NOT NULL)');
    for (const col of ['pin TEXT', 'seen INTEGER NOT NULL DEFAULT 0', "style TEXT NOT NULL DEFAULT '{}'"]) {
      try { this.sql.exec(`ALTER TABLE players ADD COLUMN ${col}`); } catch { /* colonne déjà là */ }
    }
    this.fails = new Map(); // essais de code ratés, par pseudo
    // Historique du solde de chaque joueur (graphique du profil) : les 500 derniers mouvements
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hist (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id INTEGER NOT NULL,
      at INTEGER NOT NULL, d REAL NOT NULL, b REAL NOT NULL, l TEXT NOT NULL, g TEXT NOT NULL)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS hist_player ON hist(player_id, id)');
    this.feed = [];         // derniers événements, gardés aussi dans le stockage (l'objet peut s'endormir)
    this.table = new Map(); // mains de blackjack visibles par tous (éphémère)
    ctx.blockConcurrencyWhile(async () => { this.feed = (await ctx.storage.get('feed')) || []; });
    this.rate = new Map();
    this.boardTimer = 0;
    // Gifs reçus (affichés sur l'écran du destinataire jusqu'à ce qu'il les jette) et images importées
    this.sql.exec(`CREATE TABLE IF NOT EXISTS gifts (id INTEGER PRIMARY KEY AUTOINCREMENT, to_id INTEGER NOT NULL, from_name TEXT NOT NULL,
      mode TEXT NOT NULL, url TEXT NOT NULL, name TEXT NOT NULL, w INTEGER NOT NULL DEFAULT 0, h INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL, expires INTEGER NOT NULL DEFAULT 0)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS gifts_to ON gifts(to_id, id)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, type TEXT NOT NULL, data BLOB NOT NULL, created INTEGER NOT NULL)');
    // Compteurs des classements (record = maximum, ou total cumulé)
    this.sql.exec('CREATE TABLE IF NOT EXISTS records (player_id INTEGER NOT NULL, k TEXT NOT NULL, v REAL NOT NULL DEFAULT 0, PRIMARY KEY (player_id, k))');
    this.duels = [];
    this.matches = [];
    this.mk = null;
    ctx.blockConcurrencyWhile(async () => {
      this.duels = (await ctx.storage.get('duels')) || [];
      this.matches = (await ctx.storage.get('matches')) || [];
      this.mk = (await ctx.storage.get('market')) || newMarket(Date.now());
      setMarks(this.mk.prices);
      // Une seule fois : compteurs de départ à partir de l'historique, et score recalculé en « argent total »
      if (!this.sql.exec("SELECT 1 FROM records WHERE k = '_v2'").toArray().length) {
        for (const r of this.sql.exec('SELECT id, data FROM players').toArray()) {
          const p = JSON.parse(r.data);
          const parties = Object.values(p.played || {}).reduce((a, b) => a + b, 0);
          if (parties) this.rec(r.id, 'parties', parties);
          if (p.spent) this.rec(r.id, 'gifts', p.spent);
          this.sql.exec('UPDATE players SET score = ? WHERE id = ?', score(p), r.id);
        }
        this.rec(0, '_v2', 1);
      }
    });
  }

  // Compteur d'un joueur : mode 'max' garde le plus haut, sinon on additionne
  rec(id, k, v, mode = 'add') {
    const op = mode === 'max' ? 'MAX(records.v, excluded.v)' : 'records.v + excluded.v';
    this.sql.exec(`INSERT INTO records (player_id, k, v) VALUES (?, ?, ?) ON CONFLICT(player_id, k) DO UPDATE SET v = ${op}`, id, k, v);
  }
  // Ce qui se passe après chaque action : records et compteurs
  track(id, game, action, res, played) {
    const f = res.feed || {}, r = res.result || {};
    if (f.bet > 0 && f.payout > f.bet) this.rec(id, 'mult', money(f.payout / f.bet), 'max'); // seulement les gains
    if (played > 0 && !(game === 'rps' && action !== 'bot')) this.rec(id, 'parties', played); // un duel est compté à sa fin
    if (game === 'rps' && f.outcome === 'win') this.rec(id, 'rps', 1);
    if (game === 'work' && action === 'submit' && r.pay) this.rec(id, 'tasks', r.pay > 0 ? 1 : 0);
    if (game === 'stocks' && f.act === 'sell') this.rec(id, 'stock', f.gain || 0);
    if (game === 'gifs' && r.cost) this.rec(id, 'gifts', r.cost);
  }
  // Têtes de classement, et titres détenus (pour l'affichage à côté du pseudo)
  boardData() {
    const list = BOARDS.map((b) => ({
      key: b.key, label: b.label, col: b.col, title: b.title, unit: b.unit,
      rows: this.sql.exec('SELECT r.v AS v, p.name AS name, p.style AS style FROM records r JOIN players p ON p.id = r.player_id WHERE r.k = ? AND r.v > 0 ORDER BY r.v DESC, p.id ASC LIMIT 10', b.key).toArray()
        .map((x) => ({ name: x.name, v: x.v, color: colorOf(x.style) })),
    }));
    const titles = {};
    for (const b of list) if (b.rows[0]) (titles[b.rows[0].name] ||= []).push(b.title);
    return { list, titles };
  }
  // Titres affichés : ceux que le joueur a choisis parmi ceux qu'il détient (tous par défaut)
  shownTitles(held, style) {
    let st = style;
    if (typeof st === 'string') { try { st = JSON.parse(st); } catch { st = {}; } }
    return st && Array.isArray(st.titles) ? held.filter((t) => st.titles.includes(t)) : held;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/admin') return this.admin(request);
    if (path === '/media' && request.method === 'POST') {
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      this.sql.exec('INSERT INTO media (id, type, data, created) VALUES (?, ?, ?, ?)', id, request.headers.get('Content-Type'), await request.arrayBuffer(), Date.now());
      this.sql.exec('DELETE FROM media WHERE id NOT IN (SELECT id FROM media ORDER BY created DESC LIMIT 300)');
      return new Response(JSON.stringify({ id }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (path.startsWith('/media/')) {
      const row = this.sql.exec('SELECT type, data FROM media WHERE id = ?', path.slice(7)).toArray()[0];
      return row ? new Response(row.data, { headers: { 'Content-Type': row.type } }) : new Response('Image introuvable', { status: 404 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // ---------- joueurs ----------
  load(id) {
    const row = this.sql.exec('SELECT id, name, data FROM players WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    return { id: row.id, name: row.name, p: JSON.parse(row.data) };
  }
  save(pl) {
    const games = GAMES.filter((g) => pl.p.played[g]);
    this.sql.exec('UPDATE players SET data = ?, score = ?, games = ? WHERE id = ?', JSON.stringify(pl.p), score(pl.p), JSON.stringify(games), pl.id);
  }
  me(pl) {
    const p = pl.p, sc = score(p);
    const rank = this.sql.exec('SELECT COUNT(*) AS n FROM players WHERE score > ?', sc).one().n + 1;
    return {
      name: pl.name, balance: p.balance, deposits: p.deposits, score: sc, rank,
      inventory: p.inventory, inventoryValue: inventoryValue(p), played: p.played, bj: bjView(p.bj),
      gifs: p.gifs || {}, spent: p.spent || 0, stocks: p.stocks || {}, stocksValue: stocksValue(p), bank: p.bank || 0, style: this.styleOf(pl.id),
    };
  }
  board() {
    const titles = this.boardData().titles;
    return this.sql.exec('SELECT name, score, games, style FROM players ORDER BY score DESC, id ASC LIMIT 25').toArray()
      .map((r) => ({ name: r.name, score: r.score, games: JSON.parse(r.games), titles: this.shownTitles(titles[r.name] || [], r.style), color: colorOf(r.style) }));
  }
  boardMsg() { return { t: 'board', board: this.board(), boards: this.boardData().list }; }

  // Changer de pseudo (admin ou joueur) : le nouveau nom suit partout (fil, table, roulette, défis, parties)
  async renamePlayer(id, newName) {
    if (!NAME_RE.test(newName)) return 'Pseudo : 2 à 16 caractères (lettres, chiffres, espace, _ . -).';
    if (this.sql.exec('SELECT 1 FROM players WHERE name = ? AND id != ?', newName, id).toArray().length) return 'Pseudo déjà pris.';
    const oldName = this.sql.exec('SELECT name FROM players WHERE id = ?', id).one().name;
    this.sql.exec('UPDATE players SET name = ? WHERE id = ?', newName, id);
    for (const ws of this.ctx.getWebSockets()) {
      const w = ws.deserializeAttachment();
      if (w && w.id === id) ws.serializeAttachment({ ...w, name: newName });
    }
    for (const e of this.feed) if (e.name === oldName) e.name = newName;
    await this.ctx.storage.put('feed', this.feed);
    const seat = this.table.get(id); if (seat) seat.name = newName;
    const r = await this.getRound();
    if (r.bets && r.bets[id]) { r.bets[id].name = newName; await this.ctx.storage.put('round', r); }
    for (const d of this.duels) { if (d.fromId === id) d.from = newName; if (d.to === oldName) d.to = newName; }
    for (const m of this.matches) for (const x of m.p) if (x.id === id) x.name = newName;
    await this.ctx.storage.put('duels', this.duels);
    await this.ctx.storage.put('matches', this.matches);
    this.broadcast(this.boardMsg());
    this.broadcast({ t: 'feedAll', feed: this.feed });
    this.broadcast({ t: 'table', table: [...this.table.values()] });
    this.broadcast({ t: 'round', round: await this.roundView(r) });
    this.broadcast({ t: 'duels', duels: this.duelView() });
    this.broadcast(this.online());
    return null;
  }
  // couleurs déjà prises par les autres joueurs : { couleur: pseudo }
  takenColors(id) {
    const out = {};
    for (const r of this.sql.exec("SELECT name, style FROM players WHERE id != ? AND style LIKE '%color%'", id).toArray()) { const c = colorOf(r.style); if (c) out[c] = r.name; }
    return out;
  }
  styleOf(id) { try { return JSON.parse(this.sql.exec('SELECT style FROM players WHERE id = ?', id).one().style || '{}'); } catch { return {}; } }
  // Réglages du joueur : pseudo, couleur de sa carte au classement, titres affichés
  async account(pl, action, params) {
    if (action === 'rename') {
      const name = String(params.name || '').trim();
      if (name === pl.name) return { result: { payout: 0, name } };
      const err = await this.renamePlayer(pl.id, name);
      if (err) throw new GameError(err);
      pl.name = name;
      return { result: { payout: 0, name } };
    }
    if (action === 'style') {
      const st = this.styleOf(pl.id);
      if ('color' in params) {
        const c = CARD_COLORS.includes(params.color) ? params.color : null;
        if (c && this.sql.exec('SELECT 1 FROM players WHERE id != ? AND style LIKE ?', pl.id, `%"color":"${c}"%`).toArray().length) throw new GameError('Cette couleur est déjà prise par un autre joueur.');
        st.color = c;
      }
      if ('titles' in params) st.titles = Array.isArray(params.titles) ? params.titles.map(String).slice(0, 10) : null;
      this.sql.exec('UPDATE players SET style = ? WHERE id = ?', JSON.stringify(st), pl.id);
      this.boardSoon();
      return { result: { payout: 0, style: st } };
    }
    throw new GameError('Action inconnue.');
  }

  // ---------- admin ----------
  async admin(request) {
    const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
    if (!this.env.ADMIN_KEY) return reply(503, { error: 'Le mot de passe admin n’est pas configuré (secret ADMIN_KEY).' });
    let msg;
    try { msg = await request.json(); } catch { return reply(400, { error: 'Requête illisible.' }); }
    const lock = this.adminLock || { n: 0, until: 0 };
    if (lock.until > Date.now()) return reply(429, { error: 'Trop d’essais, réessaie dans 1 min.' });
    if ((await sha256(String(msg.key || ''))) !== (await sha256(this.env.ADMIN_KEY))) {
      lock.n++;
      if (lock.n >= 5) { lock.n = 0; lock.until = Date.now() + 60000; }
      this.adminLock = lock;
      return reply(401, { error: 'Mot de passe admin incorrect.' });
    }
    this.adminLock = { n: 0, until: 0 };
    const byName = (name) => this.sql.exec('SELECT id FROM players WHERE name = ?', String(name || '')).toArray()[0];
    const refresh = (id) => {
      // Le joueur concerné voit tout de suite son nouveau solde, tout le monde voit le classement
      const pl = this.load(id);
      for (const ws of this.ctx.getWebSockets()) {
        const who = ws.deserializeAttachment();
        if (who && who.id === id) { if (pl) this.send(ws, { t: 'me', me: this.me(pl) }); else this.askLogin(ws); }
      }
    };
    const op = msg.op;
    if (op === 'list') {
      const rows = this.sql.exec('SELECT id, name, data, score, created, seen, pin IS NOT NULL AS haspin FROM players ORDER BY score DESC').toArray();
      const devices = Object.fromEntries(this.sql.exec('SELECT player_id, COUNT(*) AS n FROM tokens GROUP BY player_id').toArray().map((r) => [r.player_id, r.n]));
      return reply(200, { players: rows.map((r) => {
        const p = JSON.parse(r.data);
        return { name: r.name, balance: p.balance, deposits: p.deposits, inventory: p.inventory.length, inventoryValue: inventoryValue(p),
          score: r.score, played: p.played, created: r.created, seen: r.seen, hasPin: !!r.haspin, devices: devices[r.id] || 0,
          bank: p.bank || 0, workToday: p.work && p.work.day === workDay() ? p.work.tasks.filter((t) => t.done).reduce((a, t) => a + t.pay, 0) : 0 };
      }) });
    }
    if (op === 'resetAll') {
      for (const r of this.sql.exec('SELECT id FROM players').toArray()) {
        const pl = this.load(r.id); pl.p = newPlayer(); this.save(pl); refresh(r.id);
      }
      this.feed = []; await this.ctx.storage.put('feed', this.feed);
      this.sql.exec('DELETE FROM hist');
      this.broadcast(this.boardMsg());
      return reply(200, { ok: true, message: 'Tout le monde repart de zéro (comptes et codes gardés).' });
    }
    const row = byName(msg.name);
    if (!row) return reply(404, { error: 'Joueur introuvable.' });
    if (op === 'setBalance' || op === 'addBalance') {
      const v = money(Number(msg.amount));
      if (!Number.isFinite(v)) return reply(400, { error: 'Montant invalide.' });
      const pl = this.load(row.id);
      const before = pl.p.balance;
      pl.p.balance = money(Math.max(0, op === 'setBalance' ? v : pl.p.balance + v));
      this.save(pl); refresh(row.id); this.boardSoon();
      this.addHist(row.id, pl.p.balance - before, pl.p.balance, 'Ajustement admin', 'admin');
      return reply(200, { ok: true, message: `${pl.name} : solde ${pl.p.balance} €` });
    }
    if (op === 'rename') {
      const err = await this.renamePlayer(row.id, String(msg.newName || '').trim());
      if (err) return reply(400, { error: err });
      refresh(row.id);
      return reply(200, { ok: true, message: `Renommé en ${String(msg.newName).trim()}.` });
    }
    if (op === 'resetDeposits') {
      const pl = this.load(row.id);
      pl.p.depDay = null; pl.p.work = null;
      this.save(pl); refresh(row.id);
      return reply(200, { ok: true, message: `${pl.name} a de nouvelles tâches de travail aujourd’hui.` });
    }
    if (op === 'resetPin') {
      this.sql.exec('UPDATE players SET pin = NULL, token = ? WHERE id = ?', 'compte:' + crypto.randomUUID(), row.id);
      this.sql.exec('DELETE FROM tokens WHERE player_id = ?', row.id);
      refresh(row.id);
      for (const ws of this.ctx.getWebSockets()) { const w = ws.deserializeAttachment(); if (w && w.id === row.id) this.askLogin(ws); }
      return reply(200, { ok: true, message: 'Code effacé : le prochain code tapé deviendra le sien.' });
    }
    if (op === 'logout') {
      this.sql.exec('DELETE FROM tokens WHERE player_id = ?', row.id);
      for (const ws of this.ctx.getWebSockets()) { const w = ws.deserializeAttachment(); if (w && w.id === row.id) this.askLogin(ws); }
      return reply(200, { ok: true, message: 'Déconnecté de tous ses appareils.' });
    }
    if (op === 'delete') {
      this.sql.exec('DELETE FROM tokens WHERE player_id = ?', row.id);
      this.sql.exec('DELETE FROM players WHERE id = ?', row.id);
      this.sql.exec('DELETE FROM hist WHERE player_id = ?', row.id);
      this.sql.exec('DELETE FROM gifts WHERE to_id = ?', row.id);
      for (const ws of this.ctx.getWebSockets()) { const w = ws.deserializeAttachment(); if (w && w.id === row.id) this.askLogin(ws); }
      this.broadcast(this.boardMsg());
      return reply(200, { ok: true, message: 'Compte supprimé.' });
    }
    return reply(400, { error: 'Action inconnue.' });
  }

  // Joueurs actifs : joueurs DIFFÉRENTS, connectés, qui ont joué ou ouvert le site dans les 5 dernières minutes.
  // (Deux onglets du même joueur, un écran de connexion ou un téléphone en veille ne comptent pas en plus.)
  activeCount(except = null) { return this.activeNames(except).length; }
  activeNames(except = null) {
    // en ligne = page du site ouverte et visible : le navigateur envoie un signe de vie toutes les 30 s
    const names = new Map(), since = Date.now() - 75000;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const w = ws.deserializeAttachment();
      if (w && w.id && (w.at || 0) > since) names.set(w.id, w.name);
    }
    return [...names.values()];
  }
  online(except = null) { const names = this.activeNames(except); return { t: 'online', n: names.length, names }; }

  addHist(id, d, b, l, g) {
    if (!d) return;
    this.sql.exec('INSERT INTO hist (player_id, at, d, b, l, g) VALUES (?, ?, ?, ?, ?, ?)', id, Date.now(), money(d), b, l, g);
    if (d > 0 && g !== 'wallet' && g !== 'admin') this.rec(id, 'win', money(d), 'max'); // dépôts et ajustements ne sont pas des gains
    if (Math.random() < 0.01) this.sql.exec('DELETE FROM hist WHERE player_id = ? AND id NOT IN (SELECT id FROM hist WHERE player_id = ? ORDER BY id DESC LIMIT 20000)', id, id);
  }
  // Profil public d'un joueur : stats, inventaire CS, historique du solde
  profile(name) {
    const row = this.sql.exec('SELECT id, name, data, score, created, seen, style FROM players WHERE name = ?', String(name || '')).toArray()[0];
    if (!row) return null;
    const p = JSON.parse(row.data);
    const rank = this.sql.exec('SELECT COUNT(*) AS n FROM players WHERE score > ?', row.score).one().n + 1;
    const hist = this.sql.exec('SELECT id, at, d, b, l, g FROM hist WHERE player_id = ? ORDER BY id DESC LIMIT 400', row.id).toArray().reverse();
    return {
      name: row.name, created: row.created, seen: row.seen, rank, score: row.score, balance: p.balance, deposits: p.deposits,
      titles: this.shownTitles(this.boardData().titles[row.name] || [], row.style), heldTitles: this.boardData().titles[row.name] || [],
      style: JSON.parse(row.style || '{}'), colors: CARD_COLORS, takenColors: this.takenColors(row.id), online: this.activeNames().includes(row.name),
      inventoryValue: inventoryValue(p), played: p.played,
      inventory: [...p.inventory].sort((a, b) => b.value - a.value).map((x) => ({ uid: x.uid, n: x.n, t: x.t, i: x.i, ph: x.ph, wear: x.wear, float: x.float, range: x.range, st: x.st, value: x.value, caseId: x.caseId, at: x.at })),
      hist,
    };
  }

  // ---------- comptes ----------
  playerList() {
    return this.sql.exec('SELECT name, games FROM players ORDER BY seen DESC, name LIMIT 300').toArray()
      .map((r) => ({ name: r.name, games: JSON.parse(r.games) }));
  }
  askLogin(ws, error = '') {
    ws.serializeAttachment(null);
    this.send(ws, { t: 'login', players: this.playerList(), error });
  }
  async pinHash(pin, salt) { return sha256(`croco-casino:${salt}:${pin}`); }
  async checkToken(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const hash = await sha256(token);
    return this.sql.exec('SELECT player_id AS id FROM tokens WHERE token = ?', hash).toArray()[0]
      || this.sql.exec('SELECT id FROM players WHERE token = ?', hash).toArray()[0] || null; // anciens comptes
  }
  async remember(token, id) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return;
    this.sql.exec('INSERT OR REPLACE INTO tokens (token, player_id, created) VALUES (?, ?, ?)', await sha256(token), id, Date.now());
  }
  async welcome(ws, id) {
    const pl = this.load(id);
    if (!pl) return this.askLogin(ws);
    this.sql.exec('UPDATE players SET seen = ? WHERE id = ?', Date.now(), id);
    ws.serializeAttachment({ id: pl.id, name: pl.name, at: Date.now() });
    this.send(ws, {
      t: 'welcome', me: this.me(pl), board: this.board(), boards: this.boardData().list, feed: this.feed,
      round: await this.roundView(), table: [...this.table.values()], online: this.activeCount(), onlineNames: this.activeNames(),
      duels: this.duelView(),
    });
    // Les gifs qu'on lui a envoyés et qu'il n'a pas encore jetés
    this.sql.exec('DELETE FROM gifts WHERE expires > 0 AND expires < ?', Date.now());
    const gifts = this.sql.exec('SELECT id, from_name AS "from", mode, url, name, w, h, expires FROM gifts WHERE to_id = ? ORDER BY id', pl.id).toArray();
    if (gifts.length) this.send(ws, { t: 'gifs', add: gifts, initial: true });
    await this.checkMatches();
    const m = this.matchOf(pl.id);
    if (m) this.send(ws, { t: 'match', match: this.matchView(m, pl.id) });
    this.broadcast(this.online());
  }
  // Appareil déjà connu : on entre directement
  async hello(ws, msg) {
    const row = await this.checkToken(msg.token);
    if (row) return this.welcome(ws, row.id);
    this.askLogin(ws);
  }
  async register(ws, msg) {
    const name = String(msg.name || '').trim(), pin = String(msg.pin || '');
    if (!NAME_RE.test(name)) return this.askLogin(ws, 'Pseudo : 2 à 16 caractères.');
    if (!/^\d{4}$/.test(pin)) return this.askLogin(ws, 'Le code fait 4 chiffres.');
    if (this.sql.exec('SELECT 1 FROM players WHERE name = ?', name).toArray().length) return this.askLogin(ws, 'Pseudo déjà pris.');
    const salt = crypto.randomUUID();
    this.sql.exec('INSERT INTO players (name, token, data, created, pin) VALUES (?, ?, ?, ?, ?)',
      name, 'compte:' + crypto.randomUUID(), JSON.stringify(newPlayer()), Date.now(), `${salt}:${await this.pinHash(pin, salt)}`);
    const id = this.sql.exec('SELECT id FROM players WHERE name = ?', name).one().id;
    await this.remember(msg.token, id);
    return this.welcome(ws, id);
  }
  async login(ws, msg) {
    const name = String(msg.name || '').trim(), pin = String(msg.pin || '');
    const row = this.sql.exec('SELECT id, name, pin FROM players WHERE name = ?', name).toArray()[0];
    if (!row) return this.askLogin(ws, 'Joueur inconnu.');
    const key = row.name.toLowerCase(), f = this.fails.get(key) || { n: 0, until: 0 };
    if (f.until > Date.now()) return this.askLogin(ws, 'Trop d’essais, réessaie dans 1 min.');
    if (!row.pin) {
      // Compte créé avant les codes : le premier code tapé devient le sien
      if (!/^\d{4}$/.test(pin)) return this.askLogin(ws, 'Le code fait 4 chiffres.');
      const salt = crypto.randomUUID();
      this.sql.exec('UPDATE players SET pin = ? WHERE id = ?', `${salt}:${await this.pinHash(pin, salt)}`, row.id);
    } else {
      const [salt, hash] = row.pin.split(':');
      if ((await this.pinHash(pin, salt)) !== hash) {
        f.n++;
        if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60000; }
        this.fails.set(key, f);
        return this.askLogin(ws, f.until > Date.now() ? 'Trop d’essais, réessaie dans 1 min.' : 'Code incorrect.');
      }
    }
    this.fails.delete(key);
    await this.remember(msg.token, row.id);
    return this.welcome(ws, row.id);
  }
  async logout(ws, msg) {
    if (typeof msg.token === 'string') this.sql.exec('DELETE FROM tokens WHERE token = ?', await sha256(msg.token));
    this.askLogin(ws);
  }

  // ---------- messages ----------
  async webSocketMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.t === 'hello') return this.hello(ws, msg);
    if (msg.t === 'login') return this.login(ws, msg);
    if (msg.t === 'register') return this.register(ws, msg);
    if (msg.t === 'logout') return this.logout(ws, msg);
    const who = ws.deserializeAttachment();
    if (!who) return this.askLogin(ws);
    if (msg.t === 'ping') {
      const was = this.activeNames().join('|');
      ws.serializeAttachment({ ...who, at: Date.now() });
      if (this.activeNames().join('|') !== was) this.broadcast(this.online());
      if (this.matches.length) await this.checkMatches();
      return;
    }
    if (msg.t === 'gifrm') { this.sql.exec('DELETE FROM gifts WHERE id = ? AND to_id = ?', Number(msg.gid), who.id); return; }
    if (msg.t === 'players') {
      const on = new Set(this.activeNames());
      const list = this.sql.exec('SELECT name FROM players ORDER BY seen DESC LIMIT 300').toArray().map((r) => ({ name: r.name, online: on.has(r.name) }));
      return this.send(ws, { t: 'res', id: msg.id, ok: true, result: list });
    }
    if (msg.t === 'market') {
      const m = await this.market();
      return this.send(ws, { t: 'res', id: msg.id, ok: true, result: { prices: m.prices, hist: m.hist, news: m.news, t: m.t } });
    }
    if (msg.t === 'hist') {
      // 400 mouvements plus anciens que « before » (le plus récent d'abord)
      const row = this.sql.exec('SELECT id FROM players WHERE name = ?', String(msg.name || '')).toArray()[0];
      const list = row ? this.sql.exec('SELECT id, at, d, b, l, g FROM hist WHERE player_id = ? AND id < ? ORDER BY id DESC LIMIT 400', row.id, Number(msg.before) || 9e15).toArray() : [];
      return this.send(ws, { t: 'res', id: msg.id, ok: true, result: list });
    }
    if (msg.t === 'profile') {
      const prof = this.profile(msg.name);
      return this.send(ws, prof ? { t: 'res', id: msg.id, ok: true, result: prof } : { t: 'res', id: msg.id, ok: false, error: 'Joueur introuvable.' });
    }
    if (msg.t !== 'req') return;
    if (!this.allow(who.id)) return this.send(ws, { t: 'res', id: msg.id, ok: false, error: 'Doucement : trop de requêtes.' });
    const pl = this.load(who.id);
    if (!pl) return;
    if (Date.now() - (who.at || 0) > 60000) {
      const wasActive = this.activeCount();
      ws.serializeAttachment({ ...who, at: Date.now() });
      const n = this.activeCount();
      if (n !== wasActive) this.broadcast(this.online());
    }
    try {
      let res;
      const before = pl.p.balance, playedBefore = totalPlayed(pl.p);
      const ctx = { rng, caseList: caseData.cases, now: Date.now() };
      if (msg.game === 'roulette' && msg.action === 'bet') res = await this.rouletteBet(pl, msg.params);
      else if (msg.game === 'roulette') throw new GameError('En ligne, la roulette se joue en tours partagés.');
      else if (msg.game === 'gifs' && msg.action === 'send') res = this.sendGifs(pl, msg.params || {}, ctx);
      else if (msg.game === 'account') res = await this.account(pl, msg.action, msg.params || {});
      else if (msg.game === 'rps' && ['duel', 'accept', 'cancel', 'move', 'decline'].includes(msg.action)) res = await this.duel(pl, msg.action, msg.params || {});
      else {
        if (msg.game === 'stocks') ctx.prices = (await this.market()).prices;
        res = run(pl.p, msg.game, msg.action, msg.params || {}, ctx);
      }
      this.save(pl);
      this.addHist(pl.id, pl.p.balance - before, pl.p.balance, historyLabel(msg.game, msg.action, msg.params || {}, res.result, res.feed), msg.game);
      if (msg.game === 'crash' && msg.action === 'start') this.crashTimer(pl.id);
      this.track(pl.id, msg.game, msg.action, res, totalPlayed(pl.p) - playedBefore);
      this.send(ws, { t: 'res', id: msg.id, ok: true, result: res.result, me: this.me(pl) });
      if (msg.game === 'blackjack') this.updateTable(pl);
      if (res.feed) this.pushFeed({ name: pl.name, at: Date.now(), ...res.feed });
      this.boardSoon();
    } catch (e) {
      const error = e instanceof GameError ? e.message : 'Erreur du serveur.';
      if (!(e instanceof GameError)) console.error(e);
      this.send(ws, { t: 'res', id: msg.id, ok: false, error });
    }
  }
  async webSocketClose(ws) {
    try { ws.close(); } catch {}
    this.broadcast(this.online(ws));
  }
  async webSocketError(ws) { await this.webSocketClose(ws); }

  allow(id) {
    const now = Date.now(), r = this.rate.get(id) || { t: now, n: 0 };
    if (now - r.t > 1000) { r.t = now; r.n = 0; }
    r.n++;
    this.rate.set(id, r);
    return r.n <= 15;
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }
  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) { try { ws.send(s); } catch {} }
  }
  pushFeed(e) {
    this.feed.unshift(e);
    this.feed.length = Math.min(this.feed.length, 30);
    this.ctx.storage.put('feed', this.feed);
    this.broadcast({ t: 'feed', e });
  }
  boardSoon() {
    if (this.boardTimer) return;
    this.boardTimer = setTimeout(() => { this.boardTimer = 0; this.broadcast(this.boardMsg()); }, 1200);
  }
  updateTable(pl) {
    const v = bjView(pl.p.bj);
    if (v) this.table.set(pl.id, { name: pl.name, hand: v, at: Date.now() });
    for (const [k, s] of this.table) if (Date.now() - s.at > 120000) this.table.delete(k);
    this.broadcast({ t: 'table', table: [...this.table.values()] });
  }

  // ---------- gifs ----------
  sendGifs(pl, params, ctx) {
    const target = this.sql.exec('SELECT id, name FROM players WHERE name = ?', String(params.to || '')).toArray()[0];
    if (!target) throw new GameError('Joueur introuvable.');
    if (target.id === pl.id) throw new GameError('Tu ne peux pas t’envoyer un gif à toi-même.');
    if (!this.activeNames().includes(target.name)) throw new GameError(`${target.name} n’est pas en ligne : les gifs ne s’envoient qu’aux joueurs connectés.`);
    const g = params.gif || {};
    const url = String(g.url || '');
    if (url.length > 2000 || !/^https?:\/\//.test(url)) throw new GameError('Lien de gif invalide.');
    const name = String(g.name || 'gif').replace(/\s+/g, ' ').trim().slice(0, 60) || 'gif';
    const r = run(pl.p, 'gifs', 'send', { mode: params.mode, qty: params.qty }, ctx);
    const qty = r.result.qty, mode = r.result.mode, now = Date.now();
    const w = Math.max(0, Math.min(4000, Number(g.w) || 0)), h = Math.max(0, Math.min(4000, Number(g.h) || 0));
    const add = [];
    for (let i = 0; i < qty; i++) {
      this.sql.exec('INSERT INTO gifts (to_id, from_name, mode, url, name, w, h, created, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        target.id, pl.name, mode, url, name, w, h, now, mode === 'full' ? now + 20000 : 0);
      add.push({ id: this.sql.exec('SELECT last_insert_rowid() AS id').one().id, from: pl.name, mode, url, name, w, h, expires: mode === 'full' ? now + 20000 : 0 });
    }
    // au-delà de 120 gifs à l'écran, les plus vieux partent (sinon le téléphone rame)
    this.sql.exec('DELETE FROM gifts WHERE to_id = ? AND id NOT IN (SELECT id FROM gifts WHERE to_id = ? ORDER BY id DESC LIMIT 120)', target.id, target.id);
    const note = `${pl.name} t’a envoyé ${qty}x ${name}`;
    for (const ws of this.ctx.getWebSockets()) {
      const w2 = ws.deserializeAttachment();
      if (w2 && w2.id === target.id) this.send(ws, { t: 'gifs', add, note });
    }
    return { result: { ...r.result, to: target.name }, feed: { game: 'gifs', bet: 0, payout: 0, to: target.name, qty, gif: name, mode } };
  }

  // ---------- fusée : fin du vol annoncée par le serveur ----------
  crashTimer(id) {
    const pl = this.load(id);
    const c = pl && pl.p.crash;
    if (!c) return;
    const end = Math.min(c.at + timeTo(c.point), c.auto && c.auto <= c.point ? c.at + timeTo(c.auto) : Infinity);
    setTimeout(() => this.crashEnd(id), Math.max(0, end - Date.now()) + 40);
  }
  crashEnd(id) {
    const pl = this.load(id);
    if (!pl || !pl.p.crash) return;
    const before = pl.p.balance;
    const res = run(pl.p, 'crash', 'state', {}, { rng, now: Date.now() });
    if (!res.result.done) { this.crashTimer(id); return; }
    this.save(pl);
    this.addHist(pl.id, pl.p.balance - before, pl.p.balance, historyLabel('crash', 'state', {}, res.result), 'crash');
    for (const ws of this.ctx.getWebSockets()) {
      const w = ws.deserializeAttachment();
      if (w && w.id === id) this.send(ws, { t: 'crash', result: res.result, me: this.me(pl) });
    }
    if (res.feed) this.pushFeed({ name: pl.name, at: Date.now(), ...res.feed });
    this.boardSoon();
  }

  // ---------- chifoumi : défis entre joueurs, partie en 3 points ----------
  // Un défi (mise + adversaire facultatif) attend qu'un joueur l'accepte. La partie se joue alors manche par manche :
  // chacun choisit son coup en secret, le serveur révèle les deux, le premier à 3 points gagne les deux mises.
  // 30 s par manche : celui qui ne joue pas perd le point ; si personne ne joue deux manches de suite, tout est remboursé.
  duelView() { return this.duels.map(({ id, from, bet, to, at }) => ({ id, from, bet, to, at })); }
  async saveDuels() { await this.ctx.storage.put('duels', this.duels); this.broadcast({ t: 'duels', duels: this.duelView() }); }
  notify(id, obj) { for (const ws of this.ctx.getWebSockets()) { const w = ws.deserializeAttachment(); if (w && w.id === id) this.send(ws, obj); } }
  matchOf(id) { return this.matches.find((m) => m.phase === 'play' && m.p.some((x) => x.id === id)); }
  matchView(m, id) {
    const i = m.p[0].id === id ? 0 : 1, j = 1 - i, mv = (x) => (x == null ? null : RPS_MOVES[x]);
    const l = m.last;
    return {
      id: m.id, opp: m.p[j].name, bet: m.bet, score: [m.score[i], m.score[j]], round: m.round, myMove: mv(m.moves[i]), oppChosen: m.moves[j] != null,
      left: Math.max(0, m.deadline - Date.now()), phase: m.phase, target: WIN_POINTS,
      last: l ? { round: l.round, mine: mv(l.moves[i]), theirs: mv(l.moves[j]), outcome: l.w === -1 ? 'draw' : l.w === i ? 'win' : 'lose', timeout: l.timeout } : null,
      result: m.phase === 'done' ? (m.winner === -1 ? 'cancel' : m.winner === i ? 'win' : 'lose') : null,
    };
  }
  pushMatch(m) { for (const x of m.p) this.notify(x.id, { t: 'match', match: this.matchView(m, x.id) }); }
  async saveMatches() { this.matches = this.matches.filter((m) => m.phase === 'play'); await this.ctx.storage.put('matches', this.matches); }
  matchTimer(m) { setTimeout(() => this.matchTick(m.id), Math.max(0, m.deadline - Date.now()) + 100); }
  async matchTick(id) {
    const m = this.matches.find((x) => x.id === id && x.phase === 'play');
    if (!m || Date.now() < m.deadline - 50) return;
    this.resolveRound(m, true, null);
    this.pushMatch(m);
    await this.saveMatches();
    if (m.phase === 'play') this.matchTimer(m);
  }
  // Manches en retard (le serveur a pu s'endormir) : réglées au prochain signe de vie
  async checkMatches() { for (const m of this.matches.filter((x) => x.phase === 'play' && x.deadline < Date.now())) await this.matchTick(m.id); }
  resolveRound(m, timeout, pl) {
    const [a, b] = m.moves;
    let w;
    if (a == null && b == null) { m.idle = (m.idle || 0) + 1; w = -1; }
    else {
      m.idle = 0;
      if (a == null) w = 1; else if (b == null) w = 0;
      else { const o = rpsOutcome(a, b); w = o === 'win' ? 0 : o === 'lose' ? 1 : -1; }
    }
    if (w >= 0) m.score[w]++;
    m.last = { round: m.round, moves: [a, b], w, timeout: timeout && (a == null || b == null) };
    m.moves = [null, null]; m.round++; m.deadline = Date.now() + ROUND_MS;
    if (w >= 0 && m.score[w] >= WIN_POINTS) return this.finishMatch(m, w, pl);
    if (m.idle >= 2) return this.finishMatch(m, -1, pl);
    return null;
  }
  // Fin de partie : le gagnant prend les deux mises ; partie abandonnée par les deux = remboursée
  finishMatch(m, w, pl) {
    m.phase = 'done'; m.winner = w;
    let mine = null;
    for (let k = 0; k < 2; k++) {
      const cur = pl && pl.id === m.p[k].id, P = cur ? pl : this.load(m.p[k].id);
      if (!P) continue;
      const pay = w === -1 ? m.bet : w === k ? money(m.bet * 2) : 0, b0 = P.p.balance;
      P.p.balance = money(b0 + pay);
      P.p.played.rps = (P.p.played.rps || 0) + 1;
      this.rec(P.id, 'parties', 1);
      if (w === k) this.rec(P.id, 'rps', 1);
      const outcome = w === -1 ? 'draw' : w === k ? 'win' : 'lose';
      const label = `Chifoumi contre ${m.p[1 - k].name} : ${w === -1 ? 'annulé' : outcome === 'win' ? 'gagné' : 'perdu'} (${m.score[k]}–${m.score[1 - k]})`;
      if (cur) mine = { outcome, label, payout: pay };
      else { this.save(P); this.addHist(P.id, pay, P.p.balance, label, 'rps'); this.notify(P.id, { t: 'me', me: this.me(P) }); }
    }
    if (w >= 0) this.pushFeed({ name: m.p[w].name, at: Date.now(), game: 'rps', bet: m.bet, payout: money(m.bet * 2), outcome: 'win', vs: m.p[1 - w].name, score: `${m.score[w]}–${m.score[1 - w]}` });
    this.boardSoon();
    return mine;
  }
  async duel(pl, action, params) {
    // défis de plus de 30 min sans réponse : remboursés
    for (const d of this.duels.filter((x) => Date.now() - x.at > 30 * 60000)) await this.refundDuel(d, pl);
    await this.checkMatches();
    if (action === 'duel') {
      if (this.duels.filter((d) => d.fromId === pl.id).length >= 3) throw new GameError('3 défis ouverts maximum.');
      let to = null;
      if (params.to) {
        const t = this.sql.exec('SELECT id, name FROM players WHERE name = ?', String(params.to)).toArray()[0];
        if (!t) throw new GameError('Joueur introuvable.');
        if (t.id === pl.id) throw new GameError('Tu ne peux pas te défier toi-même.');
        to = t.name;
      }
      const bet = readBet(pl.p, params.bet);
      pl.p.balance = money(pl.p.balance - bet);
      const d = { id: crypto.randomUUID().slice(0, 8), from: pl.name, fromId: pl.id, bet, to, at: Date.now() };
      this.duels.push(d);
      await this.saveDuels();
      if (to) { const t = this.sql.exec('SELECT id FROM players WHERE name = ?', to).one(); this.notify(t.id, { t: 'duelOffer', duel: { id: d.id, from: d.from, bet: d.bet, to: d.to } }); }
      return { result: { duel: d.id, bet, payout: 0, label: 'défi lancé' } };
    }
    if (action === 'move') {
      const m = this.matches.find((x) => x.id === params.mid && x.phase === 'play');
      if (!m) throw new GameError('Cette partie est terminée.');
      const i = m.p.findIndex((x) => x.id === pl.id);
      if (i < 0) throw new GameError('Ce n’est pas ta partie.');
      const move = RPS_MOVES.indexOf(params.move);
      if (move < 0) throw new GameError('Choisis pierre, feuille ou ciseaux.');
      if (m.moves[i] != null) throw new GameError('Tu as déjà joué cette manche.');
      m.moves[i] = move;
      let end = null;
      if (m.moves[1 - i] != null) end = this.resolveRound(m, false, pl);
      this.pushMatch(m);
      await this.saveMatches();
      if (m.phase === 'play' && m.moves.every((x) => x == null)) this.matchTimer(m);
      return { result: { payout: 0, ...(end ? { outcome: end.outcome, label: end.label } : { label: 'coup joué' }) } };
    }
    const d = this.duels.find((x) => x.id === params.id);
    if (!d) throw new GameError('Ce défi n’existe plus.');
    if (action === 'decline') {
      if (!d.to || d.to.toLowerCase() !== pl.name.toLowerCase()) throw new GameError('Ce défi ne t’est pas adressé.');
      await this.refundDuel(d, null);
      this.notify(d.fromId, { t: 'note', text: `${pl.name} a refusé ton défi : ta mise est rendue.` });
      return { result: { declined: true, payout: 0, label: 'défi refusé' } };
    }
    if (action === 'cancel') {
      if (d.fromId !== pl.id) throw new GameError('Ce n’est pas ton défi.');
      pl.p.balance = money(pl.p.balance + d.bet);
      this.duels = this.duels.filter((x) => x !== d);
      await this.saveDuels();
      return { result: { cancelled: true, payout: 0 } };
    }
    // accept : la partie commence
    if (d.fromId === pl.id) throw new GameError('C’est ton propre défi.');
    if (d.to && d.to.toLowerCase() !== pl.name.toLowerCase()) throw new GameError('Ce défi est pour quelqu’un d’autre.');
    if (this.matchOf(pl.id)) throw new GameError('Finis d’abord ta partie en cours.');
    if (this.matchOf(d.fromId)) throw new GameError(`${d.from} est déjà en pleine partie, réessaie dans un instant.`);
    readBet(pl.p, d.bet);
    pl.p.balance = money(pl.p.balance - d.bet);
    this.duels = this.duels.filter((x) => x !== d);
    const m = { id: crypto.randomUUID().slice(0, 8), p: [{ id: d.fromId, name: d.from }, { id: pl.id, name: pl.name }], bet: d.bet,
      score: [0, 0], round: 1, moves: [null, null], deadline: Date.now() + ROUND_MS, phase: 'play', idle: 0, last: null };
    this.matches.push(m);
    await this.saveDuels();
    await this.saveMatches();
    this.notify(d.fromId, { t: 'note', text: `${pl.name} a accepté ton défi : la partie commence dans Chifoumi !` });
    this.pushMatch(m);
    this.matchTimer(m);
    return { result: { match: m.id, bet: d.bet, payout: 0, label: 'duel accepté' } };
  }
  async refundDuel(d, current) {
    this.duels = this.duels.filter((x) => x !== d);
    if (current && current.id === d.fromId) current.p.balance = money(current.p.balance + d.bet);
    else { const o = this.load(d.fromId); if (o) { o.p.balance = money(o.p.balance + d.bet); this.save(o); this.notify(o.id, { t: 'me', me: this.me(o) }); } }
    await this.saveDuels();
  }

  // ---------- bourse : le marché avance quand quelqu'un regarde ----------
  async market() {
    const m = this.mk;
    if (advance(m, Date.now(), rng)) {
      setMarks(m.prices);
      await this.ctx.storage.put('market', m);
      // le score des joueurs qui ont des actions suit le cours
      for (const r of this.sql.exec(`SELECT id, data FROM players WHERE data LIKE '%"sh":%'`).toArray()) {
        this.sql.exec('UPDATE players SET score = ? WHERE id = ?', score(JSON.parse(r.data)), r.id);
      }
      this.boardSoon();
    }
    return m;
  }

  // ---------- roulette en tours partagés ----------
  async getRound() {
    return (await this.ctx.storage.get('round')) || { id: 0, phase: 'idle', bets: {}, history: [] };
  }
  async roundView(r) {
    r = r || (await this.getRound());
    return {
      id: r.id, phase: r.phase, endsAt: r.endsAt || 0, n: r.n ?? null, history: r.history.slice(0, 12),
      players: Object.values(r.bets).map((b) => ({ name: b.name, total: b.total, bets: b.bets, payout: b.payout ?? null })),
    };
  }
  async rouletteBet(pl, params) {
    const r = await this.getRound();
    if (r.phase === 'spun') throw new GameError('La bille roule : attends le prochain tour.');
    const { bets, total } = readRouletteBets(pl.p, params && params.bets);
    pl.p.balance = money(pl.p.balance - total);
    if (r.phase === 'idle') {
      r.id++; r.phase = 'betting'; r.endsAt = Date.now() + BET_MS; r.bets = {}; r.n = null;
      await this.ctx.storage.setAlarm(r.endsAt);
    }
    const mine = r.bets[pl.id] || { name: pl.name, bets: {}, total: 0 };
    for (const [k, v] of Object.entries(bets)) mine.bets[k] = money((mine.bets[k] || 0) + v);
    mine.total = money(mine.total + total);
    r.bets[pl.id] = mine;
    this.save(pl); // le solde est débité avant d'enregistrer le tour
    await this.ctx.storage.put('round', r);
    this.broadcast({ t: 'round', round: await this.roundView(r) });
    return { result: { placed: bets, bet: total, payout: 0, balance: pl.p.balance, round: r.id } };
  }
  async alarm() {
    const r = await this.getRound();
    if (r.phase === 'betting') {
      const n = roulette.spin(rng);
      r.n = n; r.phase = 'spun'; r.endsAt = Date.now() + SHOW_MS;
      r.history = [n, ...r.history].slice(0, 30);
      const events = [];
      for (const [id, b] of Object.entries(r.bets)) {
        const pl = this.load(+id);
        if (!pl) continue;
        const payout = roulette.settle(b.bets, n);
        b.payout = payout;
        pl.p.balance = money(pl.p.balance + payout);
        pl.p.played.roulette = (pl.p.played.roulette || 0) + 1;
        this.save(pl);
        this.addHist(pl.id, payout, pl.p.balance, `Roulette : ${n}`, 'roulette');
        events.push({ name: pl.name, at: Date.now(), game: 'roulette', bet: b.total, payout, n });
      }
      await this.ctx.storage.put('round', r);
      await this.ctx.storage.setAlarm(r.endsAt);
      this.broadcast({ t: 'round', round: await this.roundView(r) });
      // Chacun reçoit son nouveau solde
      for (const ws of this.ctx.getWebSockets()) {
        const who = ws.deserializeAttachment();
        if (who && r.bets[who.id]) { const pl = this.load(who.id); if (pl) this.send(ws, { t: 'me', me: this.me(pl) }); }
      }
      for (const e of events) this.pushFeed(e);
      this.broadcast(this.boardMsg());
    } else if (r.phase === 'spun') {
      r.phase = 'idle'; r.bets = {}; r.endsAt = 0;
      await this.ctx.storage.put('round', r);
      this.broadcast({ t: 'round', round: await this.roundView(r) });
    }
  }
}
