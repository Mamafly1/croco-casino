// Serveur multijoueur de Croco Casino : un Worker Cloudflare + un Durable Object (stockage SQLite).
// Le site reste sur GitHub Pages ; il se connecte ici en WebSocket quand js/config.js donne l'adresse.
import { DurableObject } from 'cloudflare:workers';
import { run, newPlayer, score, inventoryValue, readRouletteBets, GameError, money, GAMES } from '../../js/engine/games.js';
import * as roulette from '../../js/engine/roulette.js';
import { view as bjView } from '../../js/engine/blackjack.js';
import { rng } from '../../js/engine/rng.js';
import caseData from '../../data/cases.json';

const BET_MS = 15000;   // durée des mises d'un tour de roulette
const SHOW_MS = 7000;   // affichage du résultat avant le tour suivant
const NAME_RE = /^[\p{L}\p{N} _.\-]{2,16}$/u;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/admin') return adminRoute(request, env);
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

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
    for (const col of ['pin TEXT', 'seen INTEGER NOT NULL DEFAULT 0']) {
      try { this.sql.exec(`ALTER TABLE players ADD COLUMN ${col}`); } catch { /* colonne déjà là */ }
    }
    this.fails = new Map(); // essais de code ratés, par pseudo
    this.feed = [];         // derniers événements, gardés aussi dans le stockage (l'objet peut s'endormir)
    this.table = new Map(); // mains de blackjack visibles par tous (éphémère)
    ctx.blockConcurrencyWhile(async () => { this.feed = (await ctx.storage.get('feed')) || []; });
    this.rate = new Map();
    this.boardTimer = 0;
  }

  async fetch(request) {
    if (new URL(request.url).pathname === '/admin') return this.admin(request);
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
    };
  }
  board() {
    return this.sql.exec('SELECT name, score, games FROM players ORDER BY score DESC, id ASC LIMIT 25').toArray()
      .map((r) => ({ name: r.name, score: r.score, games: JSON.parse(r.games) }));
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
          depositedToday: p.depDay ? p.depDay.amount : 0 };
      }) });
    }
    if (op === 'resetAll') {
      for (const r of this.sql.exec('SELECT id FROM players').toArray()) {
        const pl = this.load(r.id); pl.p = newPlayer(); this.save(pl); refresh(r.id);
      }
      this.feed = []; await this.ctx.storage.put('feed', this.feed);
      this.broadcast({ t: 'board', board: this.board() });
      return reply(200, { ok: true, message: 'Tout le monde repart de zéro (comptes et codes gardés).' });
    }
    const row = byName(msg.name);
    if (!row) return reply(404, { error: 'Joueur introuvable.' });
    if (op === 'setBalance' || op === 'addBalance') {
      const v = money(Number(msg.amount));
      if (!Number.isFinite(v)) return reply(400, { error: 'Montant invalide.' });
      const pl = this.load(row.id);
      pl.p.balance = money(Math.max(0, op === 'setBalance' ? v : pl.p.balance + v));
      this.save(pl); refresh(row.id); this.boardSoon();
      return reply(200, { ok: true, message: `${pl.name} : solde ${pl.p.balance} €` });
    }
    if (op === 'rename') {
      const newName = String(msg.newName || '').trim();
      if (!NAME_RE.test(newName)) return reply(400, { error: 'Pseudo : 2 à 16 caractères.' });
      if (this.sql.exec('SELECT 1 FROM players WHERE name = ? AND id != ?', newName, row.id).toArray().length) return reply(409, { error: 'Pseudo déjà pris.' });
      this.sql.exec('UPDATE players SET name = ? WHERE id = ?', newName, row.id);
      // Ses connexions ouvertes prennent le nouveau nom tout de suite
      for (const ws of this.ctx.getWebSockets()) {
        const w = ws.deserializeAttachment();
        if (w && w.id === row.id) ws.serializeAttachment({ ...w, name: newName });
      }
      refresh(row.id);
      this.broadcast({ t: 'board', board: this.board() });
      return reply(200, { ok: true, message: `Renommé en ${newName}.` });
    }
    if (op === 'resetDeposits') {
      const pl = this.load(row.id);
      pl.p.depDay = null;
      this.save(pl); refresh(row.id);
      return reply(200, { ok: true, message: `${pl.name} peut de nouveau déposer 100 € aujourd’hui.` });
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
      for (const ws of this.ctx.getWebSockets()) { const w = ws.deserializeAttachment(); if (w && w.id === row.id) this.askLogin(ws); }
      this.broadcast({ t: 'board', board: this.board() });
      return reply(200, { ok: true, message: 'Compte supprimé.' });
    }
    return reply(400, { error: 'Action inconnue.' });
  }

  // Joueurs actifs : joueurs DIFFÉRENTS, connectés, qui ont joué ou ouvert le site dans les 5 dernières minutes.
  // (Deux onglets du même joueur, un écran de connexion ou un téléphone en veille ne comptent pas en plus.)
  activeCount(except = null) {
    const ids = new Set(), since = Date.now() - 5 * 60000;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const w = ws.deserializeAttachment();
      if (w && w.id && (w.at || 0) > since) ids.add(w.id);
    }
    return ids.size;
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
      t: 'welcome', me: this.me(pl), board: this.board(), feed: this.feed,
      round: await this.roundView(), table: [...this.table.values()], online: this.activeCount(),
    });
    this.broadcast({ t: 'online', n: this.activeCount() });
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
    if (msg.t !== 'req') return;
    if (!this.allow(who.id)) return this.send(ws, { t: 'res', id: msg.id, ok: false, error: 'Doucement : trop de requêtes.' });
    const pl = this.load(who.id);
    if (!pl) return;
    if (Date.now() - (who.at || 0) > 60000) {
      const wasActive = this.activeCount();
      ws.serializeAttachment({ ...who, at: Date.now() });
      const n = this.activeCount();
      if (n !== wasActive) this.broadcast({ t: 'online', n });
    }
    try {
      let res;
      if (msg.game === 'roulette' && msg.action === 'bet') res = await this.rouletteBet(pl, msg.params);
      else if (msg.game === 'roulette') throw new GameError('En ligne, la roulette se joue en tours partagés.');
      else res = run(pl.p, msg.game, msg.action, msg.params || {}, { rng, caseList: caseData.cases });
      this.save(pl);
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
    this.broadcast({ t: 'online', n: this.activeCount(ws) });
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
    this.boardTimer = setTimeout(() => { this.boardTimer = 0; this.broadcast({ t: 'board', board: this.board() }); }, 1200);
  }
  updateTable(pl) {
    const v = bjView(pl.p.bj);
    if (v) this.table.set(pl.id, { name: pl.name, hand: v, at: Date.now() });
    for (const [k, s] of this.table) if (Date.now() - s.at > 120000) this.table.delete(k);
    this.broadcast({ t: 'table', table: [...this.table.values()] });
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
      this.broadcast({ t: 'board', board: this.board() });
    } else if (r.phase === 'spun') {
      r.phase = 'idle'; r.bets = {}; r.endsAt = 0;
      await this.ctx.storage.put('round', r);
      this.broadcast({ t: 'round', round: await this.roundView(r) });
    }
  }
}
