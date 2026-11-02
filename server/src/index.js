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
    if (url.pathname !== '/ws') return new Response('Croco Casino : rien ici.', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    if (allowed.length && !allowed.includes(origin)) return new Response('Origine refusée', { status: 403 });
    const stub = env.CASINO.get(env.CASINO.idFromName('main'));
    return stub.fetch(request);
  },
};

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
    this.feed = [];         // derniers événements, gardés aussi dans le stockage (l'objet peut s'endormir)
    this.table = new Map(); // mains de blackjack visibles par tous (éphémère)
    ctx.blockConcurrencyWhile(async () => { this.feed = (await ctx.storage.get('feed')) || []; });
    this.rate = new Map();
    this.boardTimer = 0;
  }

  async fetch(request) {
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

  async hello(ws, msg) {
    const token = String(msg.token || '');
    const name = String(msg.name || '').trim();
    if (token.length < 20 || token.length > 100) return this.send(ws, { t: 'error', code: 'token', error: 'Jeton invalide.' });
    const hash = await sha256(token);
    let row = this.sql.exec('SELECT id, name FROM players WHERE token = ?', hash).toArray()[0];
    if (!row) {
      if (!NAME_RE.test(name)) return this.send(ws, { t: 'error', code: 'name', error: 'Pseudo : 2 à 16 lettres ou chiffres.' });
      const taken = this.sql.exec('SELECT 1 FROM players WHERE name = ?', name).toArray().length;
      if (taken) return this.send(ws, { t: 'error', code: 'name', error: 'Ce pseudo est déjà pris.' });
      this.sql.exec('INSERT INTO players (name, token, data, created) VALUES (?, ?, ?, ?)', name, hash, JSON.stringify(newPlayer()), Date.now());
      row = this.sql.exec('SELECT id, name FROM players WHERE token = ?', hash).one();
    } else if (name && name !== row.name && NAME_RE.test(name)) {
      const taken = this.sql.exec('SELECT 1 FROM players WHERE name = ? AND id != ?', name, row.id).toArray().length;
      if (!taken) { this.sql.exec('UPDATE players SET name = ? WHERE id = ?', name, row.id); row.name = name; }
    }
    ws.serializeAttachment({ id: row.id, name: row.name });
    const pl = this.load(row.id);
    this.send(ws, {
      t: 'welcome', me: this.me(pl), board: this.board(), feed: this.feed,
      round: await this.roundView(), table: [...this.table.values()], online: this.ctx.getWebSockets().length,
    });
    this.broadcast({ t: 'online', n: this.ctx.getWebSockets().length });
  }

  // ---------- messages ----------
  async webSocketMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.t === 'hello') return this.hello(ws, msg);
    const who = ws.deserializeAttachment();
    if (!who) return this.send(ws, { t: 'error', code: 'hello', error: 'Pas encore identifié.' });
    if (msg.t !== 'req') return;
    if (!this.allow(who.id)) return this.send(ws, { t: 'res', id: msg.id, ok: false, error: 'Doucement : trop de requêtes.' });
    const pl = this.load(who.id);
    if (!pl) return;
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
    this.broadcast({ t: 'online', n: this.ctx.getWebSockets().length - 1 });
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
