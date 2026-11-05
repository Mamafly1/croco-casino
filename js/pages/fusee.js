// Page Fusée : le multiplicateur monte, tu retires avant l'explosion.
import { casino, mountShell, $, eur, reduceMotion, sfx } from '../core.js';
import { mountFeed, betControl, sessionStats } from '../widgets.js';
import { mult, timeTo } from '../engine/crash.js';

mountShell('crash');
mountFeed($('feed'), { game: 'crash', limit: 8 });
const bet = betControl();
const stats = sessionStats();
const fx2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = (m) => '×' + fx2.format(m);

$('oddsNote').innerHTML = 'La fusée explose à un point tiré au hasard au décollage. Elle dépasse ×2 une fois sur 2,02, ×10 une fois sur 10,1, ×100 une fois sur 101. ' +
  '1 fusée sur 100 explose dès le départ (×1,00). Quel que soit le moment où tu retires, le jeu garde <strong>1 %</strong> de ce qui est misé (retour 99 %).';

// état du vol : idle | flying | after (retiré, la fusée continue jusqu'à l'explosion) | boom
let engine = null, wind = null;
sfx.preload('wind');
let state = 'idle', t0 = 0, flight = null, pollT = 0, cashed = null, endAt = null, boomAt = 0;
const hist = [];

// ---------- dessin ----------
const cv = $('cv'), ctx = cv.getContext('2d');
const stars = Array.from({ length: 60 }, () => [Math.random(), Math.random(), Math.random() * 1.5 + 0.5]);
// décalage du ciel en px (× taille de l'étoile) : les étoiles filent à l'opposé de la fusée (ang = sa direction à l'écran),
// vite pendant le vol, puis plus doucement une fois fini, sans jamais s'arrêter
const sky = { x: 0, y: 0, vx: 0, vy: 0, ang: 0.9 - Math.PI / 2 };
let ff = 0; // avance rapide de la fin du vol après un retrait (facteur de vitesse, 0 = normal)
function resize() { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
addEventListener('resize', () => { resize(); draw(); });
resize();

const ROCKET = ['..w..', '.www.', '.wbw.', '.www.', 'wwwww', 'r.w.r'];
function rocket(x, y, ang, s, flame) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const P = { w: '#f0f0e6', b: '#4b69ff', r: '#de0607' };
  ROCKET.forEach((row, j) => [...row].forEach((c, i) => { if (P[c]) { ctx.fillStyle = P[c]; ctx.fillRect((i - 2.5) * s, (j - 3) * s, s + 0.5, s + 0.5); } }));
  if (flame) { ctx.fillStyle = Math.random() < 0.5 ? '#ffbf17' : '#ff6a00'; ctx.fillRect(-s, 3 * s, 2 * s, s * (1 + Math.random() * 2)); }
  ctx.restore();
}
function draw() {
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);
  const el = state === 'idle' ? 0 : (boomAt || performance.now()) - t0;
  ctx.fillStyle = 'rgba(240,240,230,.6)';
  for (const [x, y, s] of stars) ctx.fillRect(((x * W + sky.x * s) % W + W) % W, ((y * H + sky.y * s) % H + H) % H, s, s);
  if (state === 'idle') { sky.ang = 0.9 - Math.PI / 2; rocket(W * 0.12, H * 0.85, 0.9, Math.max(4, W / 90), false); return; }
  const m = state === 'boom' && flight ? flight.point : mult(el);
  // courbe : temps en x, multiplicateur en y ; les échelles grandissent pour garder la fusée vers le milieu-droit
  const tMax = Math.max(8000, el * 1.4), mMax = Math.max(2, 1 + (m - 1) * 1.5);
  const X = (t) => 30 + (t / tMax) * (W - 60), Y = (v) => H - 30 - ((v - 1) / (mMax - 1)) * (H - 80);
  ctx.strokeStyle = state === 'boom' ? '#de0607' : '#ffbf17'; ctx.lineWidth = 4; ctx.beginPath();
  for (let t = 0; t <= el; t += Math.max(50, el / 120)) { const v = mult(t); t === 0 ? ctx.moveTo(X(t), Y(v)) : ctx.lineTo(X(t), Y(v)); }
  ctx.lineTo(X(el), Y(m)); ctx.stroke();
  const x = X(el), y = Y(m), y2 = Y(mult(el + 300)), x2 = X(el + 300);
  if (state === 'boom') {
    const k = Math.min(1, (performance.now() - boomAt) / 600);
    for (let i = 0; i < 14; i++) { const a = i * 0.45, r = 10 + k * 50; ctx.fillStyle = i % 2 ? '#ffbf17' : '#de0607'; ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 7 * (1 - k) + 2, 7 * (1 - k) + 2); }
  } else { sky.ang = Math.atan2(y2 - y, x2 - x); rocket(x, y, sky.ang + Math.PI / 2, Math.max(4, W / 90), true); }
}

// ---------- vol ----------
// une seule boucle d'animation, toujours active : le ciel ne fige jamais
let last = performance.now();
function frame(now) {
  const dt = Math.min(50, now - last); last = now;
  const flying = state === 'flying' || state === 'after';
  if (state === 'after' && ff) t0 -= dt * (ff - 1); // avance rapide : le temps du vol passe ff fois plus vite
  const m = !flying ? 1 : mult(now - t0);
  const k = Math.min(1, dt / 400), lm = Math.log(m);
  const sp = flying ? 0.07 * (1 + lm / 2) * (ff ? 2.5 : 1) : 0.035; // px par ms
  sky.vx += (-sp * Math.cos(sky.ang) - sky.vx) * k;
  sky.vy += (-sp * Math.sin(sky.ang) - sky.vy) * k;
  if (!reduceMotion) { sky.x += sky.vx * dt; sky.y += sky.vy * dt; }
  if (flying) {
    $('mult').textContent = fx(m);
    if (engine) engine.set(Math.min(1, 0.45 + lm / 4), Math.min(1.7, 0.85 + lm / 3)); // le moteur monte avec le multiplicateur
    if (wind) wind.set(Math.min(1, 0.35 + lm / 3), Math.min(2.6, 0.8 + lm * 0.6)); // le vent monte dans les aigus
    if (state === 'flying') $('play').textContent = `Retirer ${fx(m)} · ${eur(flight.bet * m)}`;
    if (endAt != null && m >= endAt) boom();
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function boom() {
  state = 'boom'; boomAt = performance.now(); ff = 0;
  $('skip').hidden = true;
  if (engine) { engine.stop(); engine = null; }
  if (wind) { wind.stop(); wind = null; }
  sfx.play('boom', { vol: 1, gap: 0 });
  if (!cashed) sfx.play('lose', { delay: 0.5, vol: 0.8 });
  const p = flight.point;
  $('mult').textContent = fx(p);
  $('mult').className = 'mult ' + (cashed ? 'cashed' : 'boom');
  $('sub').textContent = cashed ? `Retiré à ${fx(cashed.mult)} : +${eur(cashed.payout - flight.bet)}` : `Boum à ${fx(p)}`;
  hist.unshift(p); hist.length = Math.min(hist.length, 14);
  $('points').innerHTML = hist.map((v) => `<span class="${v < 2 ? 'lo' : v >= 10 ? 'hi' : ''}">${fx(v)}</span>`).join('');
  stats.add(flight.bet, cashed ? cashed.payout : 0, cashed ? cashed.mult : 0, true);
  clearInterval(pollT);
  $('play').textContent = 'Lancer la fusée';
  $('play').classList.remove('stop');
  $('play').disabled = false;
}
// fin du vol connue (retrait, explosion ou retrait auto) : on montre la suite jusqu'au point d'explosion
function settle(r) {
  if (!flight || !r || !r.done) return;
  flight.point = r.point;
  clearInterval(pollT);
  if (r.mult) {
    cashed = { mult: r.mult, payout: r.payout };
    state = 'after';
    sfx.result(flight.bet, r.payout);
    $('mult').className = 'mult cashed';
    $('sub').textContent = `Retiré à ${fx(r.mult)} : +${eur(r.payout - flight.bet)}`;
    $('play').textContent = 'Retiré !';
    $('play').disabled = true;
    endAt = r.point;
    $('skip').hidden = false;
    if (reduceMotion) boom();
  } else boom();
}

async function launch() {
  $('msg').textContent = '';
  const a = $('auto').value.trim() ? parseFloat($('auto').value.replace(',', '.')) : null;
  const b = bet.get();
  $('play').disabled = true;
  try {
    const r = await casino.play('crash', 'start', { bet: b, auto: a });
    casino.reveal(0);
    flight = { bet: b, auto: r.auto, point: null };
    state = 'flying'; t0 = performance.now(); cashed = null; endAt = null; boomAt = 0; ff = 0;
    sfx.play('switch', { vol: 1 });
    if (engine) engine.stop();
    if (wind) wind.stop();
    engine = sfx.loop('engine', { vol: 0.45, rate: 0.85 });
    wind = sfx.loop('wind', { vol: 0.35, rate: 0.8 });
    $('mult').className = 'mult'; $('sub').textContent = r.auto ? `Retrait auto à ${fx(r.auto)}` : '';
    $('play').classList.add('stop');
    $('play').disabled = false;
    // le serveur annonce la fin du vol ; en secours, on lui redemande toutes les 1,5 s
    pollT = setInterval(async () => {
      try { const s = await casino.play('crash', 'state'); casino.reveal(s.payout || 0); if (s.done || s.idle) settle(s.done ? s : null); } catch {}
    }, 1500);
  } catch (e) {
    $('msg').textContent = e.message;
    $('play').disabled = false;
    if (/Solde insuffisant/.test(e.message)) casino.nudgeDeposit();
  }
}
async function cash() {
  $('play').disabled = true;
  try {
    const r = await casino.play('crash', 'cash');
    casino.reveal(r.payout || 0);
    settle(r);
  } catch (e) { $('msg').textContent = e.message; $('play').disabled = false; }
}
casino.on('crash', (r) => { if (state === 'flying') settle(r); });
$('play').addEventListener('click', () => (state === 'flying' ? cash() : state === 'after' ? null : launch()));
// après un retrait, la fusée continue : « >> » fait défiler la fin du vol en accéléré (environ une seconde)
$('skip').addEventListener('click', () => {
  if (state !== 'after') return;
  const left = timeTo(flight.point) - (performance.now() - t0);
  ff = Math.max(4, left / 1100);
  $('skip').hidden = true;
});

// une fusée lancée avant un rechargement de la page : on la règle
(async () => {
  const go = async () => { try { const s = await casino.play('crash', 'state'); casino.reveal(s.payout || 0); } catch {} };
  if (!casino.online) go(); else casino.on('status', (s) => { if (s === 'online') go(); });
})();
