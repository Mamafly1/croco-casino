// Mesure le rendement réel du Plinko sur le serveur EN LIGNE : un compte de test gagne de l'argent avec les tâches de
// travail, joue N lâchers de 0,10 €, puis on compare avec le calcul exact. `--cleanup` supprime le compte de test.
// Lancé depuis GitHub (workflow « Test du rendement Plinko ») ; variables : DROPS, RISK, ROWS, WS_URL, ADMIN_KEY.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import WebSocket from 'ws';
import { SERVER_URL } from '../js/config.js';
import { makeTask } from '../js/engine/work.js';
import { TABLES, probs } from '../js/engine/plinko.js';

const HTTP = process.env.HTTP_URL || SERVER_URL.replace(/\/+$/, '');
const WS_URL = process.env.WS_URL || HTTP.replace(/^http/, 'ws') + '/ws';
const NAME_FILE = 'rtp-test-name.txt';

if (process.argv.includes('--cleanup')) {
  if (!existsSync(NAME_FILE)) { console.log('Pas de compte de test à supprimer.'); process.exit(0); }
  const name = readFileSync(NAME_FILE, 'utf8').trim();
  if (!process.env.ADMIN_KEY) { console.log(`ADMIN_KEY absente : supprime « ${name} » à la main dans admin.html.`); process.exit(0); }
  const r = await fetch(HTTP + '/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: process.env.ADMIN_KEY, op: 'delete', name }) });
  const d = await r.json().catch(() => ({}));
  console.log(`Suppression de ${name} : HTTP ${r.status} ${d.message || d.error || ''}`);
  process.exit(r.ok ? 0 : 1);
}

const N = Math.max(100, Number(process.env.DROPS) || 2500);
const RISK = process.env.RISK || 'medium', ROWS = Number(process.env.ROWS) || 8, BET = 0.1;
const name = 'TestRTP' + Math.floor(Math.random() * 9000 + 1000);
const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');

const ws = new WebSocket(WS_URL, { headers: { Origin: 'https://mamafly1.github.io' } });
const pending = new Map();
let nextId = 1, onWelcome = null, welcomeErr = null;
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'welcome' && onWelcome) onWelcome(m);
  else if (m.t === 'login' && m.error) welcomeErr = m.error;
  else if (m.t === 'res') { const w = pending.get(m.id); if (w) { pending.delete(m.id); m.ok ? w.res(m) : w.rej(new Error(m.error)); } }
});
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
const welcomed = new Promise((res) => { onWelcome = res; });
ws.send(JSON.stringify({ t: 'register', name, pin: '1234', token }));
await Promise.race([welcomed, new Promise((_, rej) => setTimeout(() => rej(new Error('Pas de réponse à l’inscription' + (welcomeErr ? ' : ' + welcomeErr : ''))), 15000))]);
writeFileSync(NAME_FILE, name);
console.log(`Compte de test créé : ${name} (sera supprimé à la fin)`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(game, action, params = {}) {
  for (let tries = 0; ; tries++) {
    const id = nextId++;
    const p = new Promise((res, rej) => { pending.set(id, { res, rej }); setTimeout(() => { if (pending.delete(id)) rej(new Error('Le serveur ne répond pas')); }, 20000); });
    ws.send(JSON.stringify({ t: 'req', id, game, action, params }));
    try { return await p; } catch (e) { if (/Doucement/.test(e.message) && tries < 20) { await sleep(400); continue; } throw e; }
  }
}

// 1) de l'argent : les 3 tâches du jour (réponses calculées par le moteur), puis dépôt de la banque
const day = (await req('work', 'today')).result;
for (let i = 0; i < 3; i++) { const t = day.tasks[i]; if (!t.done) await req('work', 'submit', { i, ans: makeTask(t.type, t.seed).sol }); await sleep(100); }
const dep = (await req('wallet', 'deposit', { pack: 'all' })).result;
const start = dep.balance;
console.log(`Solde de départ : ${start.toFixed(2)} € (mise ${BET} € par lâcher, ${ROWS} rangées, risque ${RISK}, ${N} lâchers)`);

// 2) les lâchers : 4 requêtes en vol, 12 par seconde au plus (le serveur en accepte 15)
const table = TABLES[ROWS][RISK], pk = probs(ROWS);
const counts = Array(ROWS + 1).fill(0);
let wagered = 0, paid = 0, badMult = 0, sent = 0, done = 0, nextAt = Date.now();
async function worker() {
  while (sent < N) {
    sent++;
    const wait = nextAt - Date.now(); nextAt = Math.max(nextAt, Date.now()) + 85;
    if (wait > 0) await sleep(wait);
    const r = (await req('plinko', 'drop', { bet: BET, rows: ROWS, risk: RISK })).result;
    counts[r.k]++; wagered += r.bet; paid += r.payout;
    if (r.mult !== table[r.k]) badMult++;
    if (++done % 500 === 0) console.log(`  … ${done} lâchers, retour ${(paid / wagered * 100).toFixed(2)} %`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
const end = (await req('work', 'today')).result.balance;
ws.close();

// 3) résultats
const mean = pk.reduce((s, x, k) => s + x * table[k], 0);
const sd = Math.sqrt(pk.reduce((s, x, k) => s + x * (table[k] - mean) ** 2, 0));
const rtp = paid / wagered, se = sd / Math.sqrt(N), z = (rtp - mean) / se;
// khi² : on regroupe les bacs des deux bouts tant qu'on en attend moins de 5 (sinon le test n'est pas valable)
const groups = []; let accE = 0, accO = 0;
for (let k = 0; k <= ROWS; k++) { accE += N * pk[k]; accO += counts[k]; if (accE >= 5) { groups.push([accO, accE]); accE = 0; accO = 0; } }
if (accE > 0 && groups.length) { groups[groups.length - 1][0] += accO; groups[groups.length - 1][1] += accE; }
const chi = groups.reduce((t, [o, e]) => t + (o - e) ** 2 / e, 0), df = Math.max(1, groups.length - 1);
const chiLimit = df * (1 - 2 / (9 * df) + 1.645 * Math.sqrt(2 / (9 * df))) ** 3; // seuil à 5 %
console.log('\n===== RÉSULTAT SUR LE SERVEUR EN LIGNE =====');
console.log(`Lâchers joués : ${done} | misé ${wagered.toFixed(2)} € | rendu ${paid.toFixed(2)} €`);
console.log(`Retour mesuré : ${(rtp * 100).toFixed(2)} % | attendu (calcul exact) : ${(mean * 100).toFixed(2)} % | marge d'erreur ±${(se * 100).toFixed(1)} % (1 sigma)`);
console.log(`Écart : ${z.toFixed(2)} sigma ${Math.abs(z) < 3 ? '→ conforme' : '→ ANORMAL'}`);
console.log(`Répartition des bacs (khi² ${chi.toFixed(1)} pour ${df} degrés, limite ${chiLimit.toFixed(1)}) : ${chi < chiLimit ? 'conforme à un vrai pile ou face' : 'ANORMALE'}`);
console.log(`Multiplicateurs différents du tableau : ${badMult}`);
console.log(`Solde : ${start.toFixed(2)} → ${end.toFixed(2)} € ; variation attendue ${(paid - wagered).toFixed(2)} €, constatée ${(end - start).toFixed(2)} € ${Math.abs((end - start) - (paid - wagered)) < 0.05 ? '→ cohérent' : '→ INCOHÉRENT'}`);
