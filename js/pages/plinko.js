// Page Plinko : la partie est tirée par casino.play (navigateur en solo, serveur en ligne), puis animée.
import { casino, mountShell, $, eur, nf2, nf0, nfx, reduceMotion as reduce } from '../core.js';
import { mountFeed } from '../widgets.js';
import { TABLES, probs, rtp as plinkoRtp } from '../engine/plinko.js';

mountShell('plinko');
mountFeed($('feed'), { game: 'plinko', limit: 6 });

const SRC = 'https://s15.gifyu.com/images/bWriH.gif'; // lien gifyu
const FALLBACK = 'crocodile.gif';                      // copie publiée avec la page, si le lien est bloqué

const W = 600, H = 580, TOP = 128, BIN_H = 30, BIN_TOP = H - 16 - BIN_H;
const board = $('board'), svg = $('svg'), binsEl = $('bins'), ballsEl = $('balls'), histEl = $('history');

const pf = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 2 });
const mult = (m) => '×' + nfx.format(m);

const st = { rows: 8, risk: 'medium', bet: 1, mode: 'manual', autoN: 10, count: 0, wager: 0, profit: 0, best: 0 };
let g = null;
const flying = [];
let raf = 0, scale = 1, useFallback = false, autoLeft = 0, autoTimer = 0, inFlight = 0;

const pre = new Image();
pre.onerror = () => { useFallback = true; const p = new Image(); p.src = FALLBACK; };
pre.src = SRC;

function binColor(k, N) {
  const d = Math.abs(k - N / 2) / (N / 2);           // 0 au centre, 1 au bord
  const hue = 44 - 44 * Math.pow(d, 0.8);            // or -> rouge
  return 'hsl(' + ((hue + 360) % 360).toFixed(0) + ', 100%, ' + (56 - 6 * d).toFixed(0) + '%)'; // assez clair pour le texte noir (contraste ≥ 4,5)
}
function geom(N) {
  const dy = (BIN_TOP - TOP) / (N - 1 + 0.75);
  const dx = Math.min(W * 0.94 / (N + 2), dy * 1.15);
  return { N, dx, dy, pr: Math.max(3, dx * 0.07), R: Math.min(dx, dy) * 0.36, rowY: (r) => TOP + r * dy };
}
function contact(r, k) { return { x: W / 2 + (k - r / 2) * g.dx, y: g.rowY(r) - g.pr - g.R }; }

// ---------- plateau ----------
function buildBoard() {
  g = geom(st.rows);
  const N = st.rows;
  let s = '<text class="kicker" x="300" y="34">CROCO</text>' +
    '<text class="title title-depth" x="300" y="94">PLINKO</text><text class="title" x="300" y="89">PLINKO</text>';
  for (let r = 0; r < N; r++) {
    for (let j = 0; j < r + 3; j++) {
      s += `<circle class="peg" cx="${(W / 2 + (j - (r + 2) / 2) * g.dx).toFixed(2)}" cy="${g.rowY(r).toFixed(2)}" r="${g.pr.toFixed(2)}"/>`;
    }
  }
  svg.innerHTML = s;
  const table = TABLES[N][st.risk], w = g.dx - 4;
  let html = '';
  for (let k = 0; k <= N; k++) {
    const cx = W / 2 + (k - N / 2) * g.dx;
    html += `<div class="bin" data-k="${k}" tabindex="0" style="left:${((cx - w / 2) / W * 100).toFixed(3)}%;top:${(BIN_TOP / H * 100).toFixed(3)}%;width:${(w / W * 100).toFixed(3)}%;height:${(BIN_H / H * 100).toFixed(3)}%;background:${binColor(k, N)}">${nfx.format(table[k])}</div>`;
  }
  binsEl.innerHTML = html;
  measure();
  showOddsDefault();
  writeOddsNote();
}

function measure() {
  scale = (board.clientWidth || W) / W;
  if (g) binsEl.style.fontSize = Math.max(8, Math.min(14, g.dx * scale * (st.rows >= 11 ? 0.23 : 0.26))) + 'px';
  for (const b of flying) sizeBall(b);
}

const rtp = () => plinkoRtp(st.rows, st.risk);
const chanceText = (p) => '1 chance sur ' + nf0.format(Math.round(1 / p)) + ' (' + pf.format(p * 100) + ' %)';
function showOddsDefault() {
  const t = TABLES[st.rows][st.risk], p = probs(st.rows);
  $('oddsbar').innerHTML = `<span>Retour moyen <b>${nfx.format(rtp() * 100)} %</b></span><span>Max <b>${mult(t[0])}</b> : ${chanceText(p[0] * 2)}</span><span>Survole un bac pour voir ses chances</span>`;
}
function showOddsFor(k) {
  const t = TABLES[st.rows][st.risk], p = probs(st.rows);
  $('oddsbar').innerHTML = `<span>Bac <b>${mult(t[k])}</b></span><span>${chanceText(p[k])}</span><span>${t[k] >= 1 ? 'Gain ' : 'Perte '}<b>${eur(Math.abs(t[k] - 1) * st.bet)}</b> sur une mise de ${eur(st.bet)}</span>`;
}
function writeOddsNote() {
  const t = TABLES[st.rows][st.risk], p = probs(st.rows);
  let lose = 0;
  for (let k = 0; k <= st.rows; k++) if (t[k] < 1) lose += p[k];
  $('oddsNote').innerHTML = 'Chaque croco va à gauche ou à droite à chaque clou, au hasard. Résultat : il finit presque toujours au milieu.<br>' +
    `<strong>${nfx.format(lose * 100)} %</strong> des lâchers rapportent moins que la mise. Le ${mult(t[0])} sort <strong>1 fois sur ${nf0.format(Math.round(1 / (p[0] * 2)))}</strong>. Sur la durée, le jeu garde environ <strong>${nfx.format(100 - rtp() * 100)} %</strong> de tout ce qui est misé.`;
}

binsEl.addEventListener('mouseover', (e) => { const b = e.target.closest('.bin'); if (b) showOddsFor(+b.dataset.k); });
binsEl.addEventListener('focusin', (e) => { const b = e.target.closest('.bin'); if (b) showOddsFor(+b.dataset.k); });
binsEl.addEventListener('click', (e) => { const b = e.target.closest('.bin'); if (b) showOddsFor(+b.dataset.k); });
binsEl.addEventListener('mouseleave', showOddsDefault);

// ---------- billes ----------
function sizeBall(b) {
  const d = 2 * b.R * scale;
  b.el.style.width = d + 'px';
  b.el.style.height = d + 'px';
}
function onImgError(e) {
  const el = e.currentTarget;
  if (el.dataset.fb) return;
  el.dataset.fb = '1';
  useFallback = true;
  el.src = FALLBACK;
}

function startSeg(b, now) {
  const N = b.N, tempo = Math.sqrt(b.dy / 54);
  let from, to, dur, hop;
  if (b.seg === 0) {
    from = { x: W / 2 + (Math.random() - 0.5) * b.dx * 0.2, y: TOP - b.dy * 1.4 - b.R };
    to = contact(0, 0); dur = 0.3 * tempo; hop = 0;
  } else if (b.seg < N) {
    from = contact(b.seg - 1, b.k); b.k += b.path[b.seg - 1]; to = contact(b.seg, b.k);
    dur = 0.2 * tempo * (0.9 + Math.random() * 0.2); hop = b.dy * 0.33;
  } else {
    from = contact(N - 1, b.k); b.k += b.path[N - 1];
    to = { x: W / 2 + (b.k - N / 2) * b.dx, y: BIN_TOP - b.R * 0.35 };
    dur = 0.2 * tempo; hop = b.dy * 0.22;
  }
  Object.assign(b, { from, to, t0: now, dur: dur * 1000, hop, spin: (Math.random() - 0.5) * 30 });
}

// Physique : gravité, rebonds sur les clous et les bords. Le bac est tiré au sort avant
// (gauche/droite à 50 % à chaque rangée), puis on simule une chute physique qui y arrive.
const dbg = window.plinkoDebug = { sims: 0, tries: 0, fails: 0 };
function simulate(N, path) {
  const G = g, R = G.R, PR = G.pr, dx = G.dx, dy = G.dy;
  const ks = [0];
  for (let i = 0; i < N; i++) ks.push(ks[i] + path[i]);
  const target = ks[N], binX = W / 2 + (target - N / 2) * dx;
  const planX = (r) => (r >= N ? binX : W / 2 + (ks[r] - r / 2) * dx);
  const grav = 62 * dy, h = 1 / 240, E = 0.42, land = BIN_TOP - R * 0.35;
  dbg.sims++;
  for (let attempt = 0; attempt < 40; attempt++) {
    dbg.tries++;
    let x = W / 2 + (Math.random() - 0.5) * dx * 0.25, y = TOP - dy * 1.4 - R;
    let vx = (Math.random() - 0.5) * 20, vy = 0, rot = (Math.random() - 0.5) * 40;
    const xs = [x], ys = [y], rs = [rot];
    let steps = 0, kb = -1;
    while (steps++ < 240 * 9) {
      const rf = (y + R + PR - TOP) / dy;
      let xt;
      if (rf < 0) xt = planX(0);
      else if (rf >= N - 1) xt = binX;
      else { const r0 = Math.floor(rf); xt = planX(r0) + (planX(r0 + 1) - planX(r0)) * (rf - r0); }
      vx += (rf >= N - 1 ? 90 : 30) * (xt - x) * h;
      vy += grav * h;
      x += vx * h;
      y += vy * h;
      const rc = Math.round((y - TOP) / dy);
      for (let r = rc - 1; r <= rc + 1; r++) {
        if (r < 0 || r >= N) continue;
        const py = TOP + r * dy;
        if (Math.abs(y - py) > R + PR) continue;
        const j0 = Math.round((x - W / 2) / dx + (r + 2) / 2);
        for (let j = j0 - 1; j <= j0 + 1; j++) {
          if (j < 0 || j > r + 2) continue;
          const px = W / 2 + (j - (r + 2) / 2) * dx;
          const ddx = x - px, ddy = y - py, m = R + PR, d2 = ddx * ddx + ddy * ddy;
          if (d2 >= m * m || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = ddx / d, ny = ddy / d;
          x = px + nx * m; y = py + ny * m;
          const vn = vx * nx + vy * ny;
          if (vn < 0) {
            vx -= (1 + E) * vn * nx;
            vy -= (1 + E) * vn * ny;
            const nxt = planX(r + 1), s = Math.abs(nxt - x) < 1 ? (path[r] ? 1 : -1) : (nxt > x ? 1 : -1);
            const vmin = dx * (1.85 + Math.random() * 1.1);
            if (vx * s < vmin) vx = s * Math.max(Math.abs(vx) * 0.6, vmin);
          }
        }
      }
      if (x < R) { x = R; vx = Math.abs(vx) * 0.5; }
      else if (x > W - R) { x = W - R; vx = -Math.abs(vx) * 0.5; }
      if (y > BIN_TOP - R * 1.2) {
        const kk = Math.max(0, Math.min(N, Math.round((x - W / 2) / dx + N / 2)));
        const cen = W / 2 + (kk - N / 2) * dx, lo = cen - dx / 2 + R, hi = cen + dx / 2 - R;
        if (x < lo) { x = lo; vx = Math.abs(vx) * 0.4; } else if (x > hi) { x = hi; vx = -Math.abs(vx) * 0.4; }
      }
      rot += vx * h / R * 57.3;
      if (y >= land) {
        y = land;
        kb = Math.max(0, Math.min(N, Math.round((x - W / 2) / dx + N / 2)));
        xs.push(x); ys.push(y); rs.push(rot);
        break;
      }
      if (steps % 4 === 0) { xs.push(x); ys.push(y); rs.push(rot); }
    }
    if (kb === target) return { xs, ys, rs };
  }
  dbg.fails++;
  return null;
}
dbg.simulate = simulate;

async function dropOne() {
  const bet = st.bet;
  inFlight++;
  lockBoard();
  let r;
  try {
    r = await casino.play('plinko', 'drop', { bet, rows: st.rows, risk: st.risk });
  } catch (err) {
    say(err.message);
    if (/Solde insuffisant/.test(err.message)) casino.nudgeDeposit();
    return false;
  } finally {
    inFlight--;
  }
  say('');
  st.wager += bet;
  st.count++;
  if (r.rows !== st.rows) buildBoard();

  const el = document.createElement('img');
  el.className = 'ball';
  el.alt = '';
  el.draggable = false;
  el.addEventListener('error', onImgError);
  el.src = useFallback ? FALLBACK : SRC;
  ballsEl.appendChild(el);

  const b = { el, N: r.rows, risk: r.risk, bet, path: r.path, k: 0, seg: 0, dx: g.dx, dy: g.dy, R: g.R, rot: 0, born: performance.now(), result: r };
  b.k = r.k;
  b.rec = simulate(r.rows, r.path);
  b.t0 = performance.now();
  sizeBall(b);
  if (!b.rec) { b.k = 0; startSeg(b, b.t0); }
  flying.push(b);
  lockBoard();
  renderHud();
  if (!raf) raf = requestAnimationFrame(frame);
  return true;
}

function land(b) {
  const r = b.result;
  casino.reveal(r.payout);
  st.profit += r.payout - r.bet;
  if (r.mult > st.best) st.best = r.mult;
  renderHud();
  const bin = binsEl.children[r.k];
  if (bin) { bin.classList.remove('hit'); void bin.offsetWidth; bin.classList.add('hit'); }
  const chip = document.createElement('span');
  chip.textContent = mult(r.mult);
  chip.style.background = binColor(r.k, b.N);
  histEl.insertBefore(chip, histEl.firstChild);
  while (histEl.children.length > 5) histEl.removeChild(histEl.lastChild);
  b.el.style.opacity = '0';
  const el = b.el;
  setTimeout(() => el.remove(), 260);
}

function popScale(b, now) {
  if (reduce) return 1;
  const t = Math.min(1, (now - b.born) / 200), c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function frame(now) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const b = flying[i];
    if (b.rec) {
      const rec = b.rec, n = rec.xs.length, fi = (now - b.t0) / (1000 / 60);
      const i0 = Math.min(n - 1, Math.floor(fi)), i1 = Math.min(n - 1, i0 + 1), f = Math.min(1, fi - i0);
      const px = rec.xs[i0] + (rec.xs[i1] - rec.xs[i0]) * f;
      const py = rec.ys[i0] + (rec.ys[i1] - rec.ys[i0]) * f;
      const pr = reduce ? 0 : rec.rs[i0] + (rec.rs[i1] - rec.rs[i0]) * f;
      b.el.style.transform = `translate3d(${((px - b.R) * scale).toFixed(1)}px,${((py - b.R) * scale).toFixed(1)}px,0) rotate(${pr.toFixed(1)}deg) scale(${popScale(b, now).toFixed(3)})`;
      if (fi >= n - 1) { land(b); flying.splice(i, 1); }
      continue;
    }
    const t = Math.min(1, (now - b.t0) / b.dur);
    const x = b.from.x + (b.to.x - b.from.x) * t;
    const y = b.seg === 0 ? b.from.y + (b.to.y - b.from.y) * t * t : b.from.y + (b.to.y - b.from.y) * t - b.hop * 4 * t * (1 - t);
    const rot = reduce ? 0 : b.rot + b.spin * t;
    b.el.style.transform = `translate3d(${((x - b.R) * scale).toFixed(1)}px,${((y - b.R) * scale).toFixed(1)}px,0) rotate(${rot.toFixed(1)}deg) scale(${popScale(b, now).toFixed(3)})`;
    if (t >= 1) {
      b.rot = rot;
      if (b.seg >= b.N) { land(b); flying.splice(i, 1); } else { b.seg++; startSeg(b, now); }
    }
  }
  if (flying.length) raf = requestAnimationFrame(frame);
  else { raf = 0; lockBoard(); }
}

// ---------- interface ----------
function say(t) { $('msg').textContent = t; }
function renderHud() {
  $('betMax').textContent = 'max ' + eur(casino.shownBalance());
  $('sCount').textContent = nf0.format(st.count);
  $('sWager').textContent = eur(st.wager);
  const p = $('sProfit');
  p.textContent = (st.profit > 0.004 ? '+' : '') + eur(st.profit);
  p.className = st.profit > 0.004 ? 'pos' : st.profit < -0.004 ? 'neg' : '';
  $('sBest').textContent = st.best ? mult(st.best) : '–';
}
casino.on('me', renderHud);
function lockBoard() {
  const busy = flying.length > 0 || autoLeft > 0 || inFlight > 0;
  document.querySelectorAll('#risk button, #rows button').forEach((b) => { b.disabled = busy; });
}
function pressIn(groupId, attr, value) {
  document.querySelectorAll('#' + groupId + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));
}
function readBet() {
  let v = parseFloat(String($('bet').value).replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(v) || v < 0.1) v = 0.1;
  st.bet = Math.round(v * 100) / 100;
}
function writeBet() { $('bet').value = nf2.format(st.bet).replace(/\s/g, ''); }

$('bet').addEventListener('change', () => { readBet(); writeBet(); });
$('half').addEventListener('click', () => { readBet(); st.bet = Math.max(0.1, Math.round(st.bet / 2 * 100) / 100); writeBet(); });
$('double').addEventListener('click', () => {
  readBet();
  st.bet = Math.max(0.1, Math.min(Math.round(st.bet * 200) / 100, Math.floor(casino.shownBalance() * 100) / 100 || 0.1));
  writeBet();
});
$('risk').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  st.risk = b.dataset.risk; pressIn('risk', 'data-risk', st.risk); buildBoard();
});
$('rows').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  st.rows = +b.dataset.rows; pressIn('rows', 'data-rows', st.rows); buildBoard();
});
$('autoCount').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  st.autoN = +b.dataset.n; pressIn('autoCount', 'data-n', st.autoN); playLabel();
});

function setMode(m) {
  if (autoLeft) stopAuto();
  st.mode = m;
  $('tabManual').setAttribute('aria-pressed', String(m === 'manual'));
  $('tabAuto').setAttribute('aria-pressed', String(m === 'auto'));
  $('autoBox').hidden = m !== 'auto';
  playLabel();
}
$('tabManual').addEventListener('click', () => setMode('manual'));
$('tabAuto').addEventListener('click', () => setMode('auto'));

function playLabel() {
  const p = $('play');
  if (st.mode === 'manual') { p.textContent = 'Miser'; p.classList.remove('stop'); }
  else if (autoLeft) { p.textContent = 'Arrêter (' + autoLeft + ' restants)'; p.classList.add('stop'); }
  else { p.textContent = 'Lancer l’auto (' + st.autoN + ')'; p.classList.remove('stop'); }
}
async function autoTick() {
  if (!autoLeft) return;
  if (!(await dropOne())) { stopAuto(); return; }
  if (!autoLeft) return;
  autoLeft--;
  playLabel();
  if (autoLeft) autoTimer = setTimeout(autoTick, 260);
  else { playLabel(); lockBoard(); }
}
function stopAuto() { clearTimeout(autoTimer); autoLeft = 0; playLabel(); lockBoard(); }

function play() {
  readBet(); writeBet();
  if (st.mode === 'manual') { dropOne(); return; }
  if (autoLeft) { stopAuto(); return; }
  autoLeft = st.autoN;
  lockBoard();
  autoTick();
}
$('play').addEventListener('click', play);
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !$('shop').hidden) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'A') return;
  e.preventDefault();
  play();
});
window.addEventListener('resize', measure);

writeBet();
buildBoard();
renderHud();
playLabel();
