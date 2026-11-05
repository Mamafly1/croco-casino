// Sons du casino. De petits MP3 (dossier sounds/, voir sounds/CREDITS.md) joués avec Web Audio :
// démarrage instantané, plusieurs sons en même temps, légère variation de hauteur pour ne pas répéter toujours le même.
// Réglages (son coupé ou non, volume) gardés dans ce navigateur.
const KEY = 'croco-sound';
const read = () => { try { return { on: true, vol: 0.6, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { on: true, vol: 0.6 }; } };
const st = read();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };

// Un nom peut avoir plusieurs variantes : on en tire une au hasard
const VARIANTS = {
  card: ['card1', 'card2', 'card3', 'card4'], slide: ['slide1', 'slide2', 'slide3'],
  chipLay: ['chipLay1', 'chipLay2', 'chipLay3'], chipHit: ['chipHit1', 'chipHit2', 'chipHit3', 'chipHit4'],
  chipStack: ['chipStack1', 'chipStack2', 'chipStack3'], chipHandle: ['chipHandle1', 'chipHandle2'],
  diceThrow: ['diceThrow1', 'diceThrow2'], coin: ['coin1', 'coin2', 'coin3'],
};
const FILES = ['click', 'switch', 'shuffle', 'diceShake', 'win', 'jackpot', 'up', 'rise', 'notify', 'lose', 'engine', 'boom', ...Object.values(VARIANTS).flat()];
// volume propre à chaque son (avant le volume général)
const LEVEL = { click: 0.3, switch: 0.45, card: 0.7, slide: 0.6, chipHit: 0.5, chipLay: 0.7, chipStack: 0.7, chipHandle: 0.6, diceThrow: 0.7, diceShake: 0.6, shuffle: 0.6,
  coin: 0.55, win: 0.8, jackpot: 0.9, up: 0.6, rise: 0.6, notify: 0.6, lose: 0.4, engine: 0.45, boom: 0.9 };

let ctx = null, master = null, voices = 0;
const buffers = {}, lastAt = {};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { return null; }
  master = ctx.createGain();
  master.gain.value = st.vol;
  master.connect(ctx.destination);
  for (const name of FILES) {
    fetch(new URL(`../sounds/${name}.mp3`, import.meta.url))
      .then((r) => r.arrayBuffer())
      .then((buf) => new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej))) // forme avec rappels : vieux Safari
      .then((b) => { buffers[name] = b; })
      .catch(() => {});
  }
  return ctx;
}
// Les navigateurs n'autorisent le son qu'après un appui : on réveille alors le contexte audio
function unlock() { const c = ensure(); if (c && c.state !== 'running') c.resume().catch(() => {}); }
for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });
if (st.on) ensure();

function pick(name) { const v = VARIANTS[name]; return v ? v[Math.floor(Math.random() * v.length)] : name; }

export const sfx = {
  get on() { return st.on; },
  get vol() { return st.vol; },
  setOn(on) { st.on = !!on; save(); if (st.on) unlock(); },
  setVol(v) { st.vol = Math.max(0, Math.min(1, v)); save(); ensure(); if (master) master.gain.value = st.vol; },

  // Joue un son. vol : 0 à 1 (en plus du volume général) ; rate : hauteur (1 = normale) ; delay : en secondes ;
  // gap : délai minimum en ms avant de rejouer ce même son (évite que 50 billes fassent une bouillie)
  play(name, { vol = 1, rate = 1, delay = 0, gap = 25, vary = 0.05 } = {}) {
    if (!st.on || !ensure()) return null;
    const key = pick(name), b = buffers[key];
    if (!b) return null;
    const now = performance.now();
    if (now - (lastAt[name] || 0) < gap) return null;
    lastAt[name] = now;
    if (voices > 14) return null;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    g.gain.value = Math.min(1, vol * (LEVEL[name] ?? 0.6));
    src.connect(g); g.connect(master);
    voices++;
    src.onended = () => { voices--; };
    src.start(ctx.currentTime + delay);
    return src;
  },
  // Son en boucle (moteur de la fusée) : renvoie { set(vol, rate), stop() }
  loop(name, { vol = 1, rate = 1 } = {}) {
    const none = { set() {}, stop() {} };
    if (!st.on || !ensure() || !buffers[name]) return none;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name]; src.loop = true; src.playbackRate.value = rate;
    g.gain.value = 0; src.connect(g); g.connect(master);
    const level = LEVEL[name] ?? 0.6;
    g.gain.setTargetAtTime(vol * level, ctx.currentTime, 0.05);
    src.start();
    return {
      set(v, r) { g.gain.setTargetAtTime(v * level, ctx.currentTime, 0.08); if (r) src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.1); },
      stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.04); setTimeout(() => { try { src.stop(); } catch {} }, 250); },
    };
  },
  // Fin d'une partie : pièces pour un petit gain, jingle pour un gros, jackpot pour un très gros, son triste si tout est perdu
  result(bet, payout) {
    if (!(bet > 0)) return;
    const m = payout / bet;
    if (payout <= 0) this.play('lose', { gap: 700, vol: 0.8 });
    else if (m >= 20) this.play('jackpot');
    else if (m >= 5) this.play('win');
    else if (m > 1.0001) { this.play('coin', { vol: Math.min(1, 0.6 + m / 10), gap: 80 }); if (m >= 2) this.play('coin', { delay: 0.12, vol: 0.7 }); }
  },
};
