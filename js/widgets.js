// Éléments partagés : classement, fil en direct, cartes à jouer en SVG.
import { casino, eur, esc, nf0, nf2, nfx, reduceMotion } from './core.js';
import { pixelIcon, GAME_INFO } from './icons.js';
import { openProfile } from './profile.js';
import { GAMES, GIF_MODES } from './engine/games.js';

// ---------- classements : un carrousel qu'on fait glisser, « Argent total » en premier ----------
// Les points en dessous montrent qu'il y a d'autres classements ; on peut aussi les toucher, ou utiliser les flèches.
export function mountBoard(el, { limit = 10 } = {}) {
  let idx = 0;
  el.innerHTML = `
    <div class="lb-track" tabindex="0" role="region" aria-roledescription="carrousel" aria-label="Classements : glisse pour changer"></div>
    <div class="lb-nav">
      <button type="button" class="lb-arrow" data-dir="-1" aria-label="Classement précédent">‹</button>
      <div class="lb-dots" role="group" aria-label="Choisir un classement"></div>
      <button type="button" class="lb-arrow" data-dir="1" aria-label="Classement suivant">›</button>
    </div>`;
  const track = el.querySelector('.lb-track'), dots = el.querySelector('.lb-dots');
  const table = (head, body, cols) => `<table class="lb${cols === 2 ? ' two' : ''}"><thead><tr>${head}</tr></thead>
    <tbody>${body || `<tr><td colspan="${cols}" style="text-align:center">PERSONNE ENCORE</td></tr>`}</tbody></table>`;
  const row = (r, i, extra, cells) => `<tr class="${r.name === casino.me.name ? 'me' : ''}" data-name="${esc(r.name)}" tabindex="0" title="Voir le profil">
    <td class="name"><span class="rk">${i + 1}</span>${esc(r.name.toUpperCase())}${extra || ''}</td>${cells}</tr>`;

  const slides = () => {
    const me = casino.me;
    let rows = casino.board.slice(0, limit), note;
    if (!casino.online) {
      rows = [{ name: me.name, score: me.score, games: GAMES.filter((g) => me.played[g]) }];
      note = 'Mode solo : les classements partagés apparaîtront quand le serveur sera branché.';
    } else if (casino.status !== 'online' && !rows.length) note = 'Connexion au classement…';
    else note = 'Solde + inventaire + actions. Les gifs envoyés le font baisser.';
    const mine = casino.online && me.rank && me.rank > limit ? `<p class="lb-note">Ta place : ${me.rank} · ${fmtScore(me.score)}</p>` : '';
    const general = { title: 'ARGENT TOTAL', html: table('<th>JOUEUR</th><th class="r">ARGENT</th><th class="r">JEUX</th>', rows.map((r, i) => row(r, i,
      (r.titles || []).length ? `<span class="ttls">${r.titles.map(esc).join(' · ')}</span>` : '',
      `<td class="r">${fmtScore(r.score)}</td><td><div class="ico">${gamesCell(r.games || [])}</div></td>`)).join(''), 3) + mine + `<p class="lb-note">${note}</p>` };
    const others = casino.online ? (casino.boards || []).map((b) => ({
      title: b.title.toUpperCase(),
      html: `<p class="lb-sub">${esc(b.label)}</p>` + table(`<th>JOUEUR</th><th class="r">${esc(b.col || '')}</th>`, b.rows.map((r, i) => row(r, i, '', `<td class="r">${fmtUnit(r.v, b.unit)}</td>`)).join(''), 2),
    })) : [];
    return [general, ...others];
  };

  // position d'un classement dans le carrousel (il y a un écart entre deux classements)
  const posOf = (i) => (track.children[i] ? track.children[i].offsetLeft - track.children[0].offsetLeft : 0);
  const step = () => (track.children[1] ? posOf(1) : track.clientWidth) || 1;
  const setDots = () => {
    dots.querySelectorAll('button').forEach((d, i) => { d.classList.toggle('on', i === idx); d.setAttribute('aria-current', String(i === idx)); });
    el.querySelectorAll('.lb-arrow').forEach((a) => { a.disabled = a.dataset.dir === '-1' ? idx === 0 : idx >= dots.children.length - 1; });
  };
  const go = (i) => {
    idx = Math.max(0, Math.min(dots.children.length - 1, i));
    track.scrollTo({ left: posOf(idx), behavior: reduceMotion ? 'auto' : 'smooth' });
    setDots();
  };
  const draw = () => {
    const list = slides();
    track.innerHTML = list.map((s, i) => `<section class="lb-slide" aria-label="${esc(s.title)} (${i + 1} sur ${list.length})"><h2>${esc(s.title)}</h2>${s.html}</section>`).join('');
    dots.innerHTML = list.map((s, i) => `<button type="button" data-i="${i}" aria-label="${esc(s.title)}"><i></i></button>`).join('');
    el.querySelector('.lb-nav').hidden = list.length < 2;
    if (idx >= list.length) idx = 0;
    track.scrollLeft = posOf(idx); // garder le classement affiché quand les données changent
    setDots();
  };
  // le point actif suit le glissement du doigt
  let raf = 0;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const i = Math.round(track.scrollLeft / step()); if (i !== idx) { idx = i; setDots(); } });
  }, { passive: true });
  dots.addEventListener('click', (e) => { const d = e.target.closest('button[data-i]'); if (d) go(+d.dataset.i); });
  el.querySelectorAll('.lb-arrow').forEach((a) => a.addEventListener('click', () => go(idx + Number(a.dataset.dir))));
  track.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(idx + 1); if (e.key === 'ArrowLeft') go(idx - 1); });
  addEventListener('resize', () => { track.scrollLeft = posOf(idx); });
  casino.on('board', draw).on('boards', draw).on('me', draw).on('status', draw);
  const open = (e) => { const tr = e.target.closest('tr[data-name]'); if (tr) openProfile(tr.dataset.name); };
  track.addEventListener('click', open);
  track.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
  draw();
}

// Jeux joués : 2 icônes, puis « +N » en gris pour les autres
function gamesCell(games) {
  if (!games.length) return '<span class="more">-</span>';
  return games.slice(0, 2).map((g) => pixelIcon(g, 16, GAME_INFO[g] ? GAME_INFO[g].name : g)).join('') + (games.length > 2 ? `<span class="more" title="${games.slice(2).map((g) => (GAME_INFO[g] ? GAME_INFO[g].name : g)).join(', ')}">+${games.length - 2}</span>` : '');
}
function fmtUnit(v, unit) {
  if (unit === 'eur') return eur(v);
  if (unit === 'x') return '×' + nfx.format(v);
  return nf0.format(v);
}

function fmtScore(s) {
  return (s > 0.004 ? '+' : '') + nf2.format(s);
}

// ---------- fil en direct ----------
export function feedText(e) {
  switch (e.game) {
    case 'plinko': return `Plinko ×${nfx.format(e.mult)}`;
    case 'slots': return e.payout > 0 ? `Machine à sous ×${nfx.format(e.payout / e.bet)}` : 'Machine à sous';
    case 'roulette': return `Roulette : ${e.n}`;
    case 'blackjack': return `Blackjack : ${({ win: 'gagné', blackjack: 'blackjack', push: 'égalité', lose: 'perdu', bust: 'sauté' })[e.result] || e.result}`;
    case 'cases': return e.item ? `${e.item.st ? 'StatTrak™ ' : ''}${e.item.n}${e.item.wear ? ' (' + e.item.wear + ')' : ''}` : 'Caisse';
    case 'crash': return e.mult ? `Fusée : retirée à ×${nfx.format(e.mult)}` : `Fusée : boum à ×${nfx.format(e.point)}`;
    case 'rps': return `Chifoumi contre ${e.vs || 'le croco'} : ${({ win: 'gagné', lose: 'perdu', draw: 'égalité' })[e.outcome] || ''}${e.score ? ' ' + e.score : ''}`;
    case 'stocks': return `Bourse : ${e.act === 'buy' ? 'achète' : 'vend'} ${e.co}`;
    case 'gifs': return `→ ${e.to} : ${e.qty}× ${e.gif}`;
    default: return e.game;
  }
}

export function mountFeed(el, { game = null, limit = 12 } = {}) {
  const draw = () => {
    const list = casino.feed.filter((e) => !game || e.game === game).slice(0, limit);
    if (!list.length) { el.innerHTML = '<p class="feed-empty">Rien pour l’instant. Les parties de tout le monde s’affichent ici.</p>'; return; }
    el.innerHTML = '<ul class="feed">' + list.map((e) => {
      const net = e.game === 'cases' ? e.payout : e.payout - e.bet;
      let cls = e.game === 'cases' ? (e.item && ['covert', 'rare'].includes(e.item.t) ? 'pos' : '') : net > 0.004 ? 'pos' : net < -0.004 ? 'neg' : '';
      let amt = e.game === 'cases' ? eur(e.payout) : (net > 0.004 ? '+' : '') + eur(net);
      if (e.game === 'stocks') { amt = eur(e.amount); cls = e.act === 'sell' && e.gain != null ? (e.gain >= 0 ? 'pos' : 'neg') : ''; }
      if (e.game === 'gifs') { amt = GIF_MODES[e.mode] || ''; cls = ''; }
      return `<li>${pixelIcon(e.game, 18)}<button type="button" class="who" data-name="${esc(e.name)}">${esc(e.name)}</button><span class="what">${esc(feedText(e))}</span><span class="amt ${cls}">${amt}</span></li>`;
    }).join('') + '</ul>';
  };
  casino.on('feed', draw).on('feeds', draw);
  el.addEventListener('click', (e) => { const b = e.target.closest('button.who'); if (b) openProfile(b.dataset.name); });
  draw();
}

// ---------- cartes à jouer ----------
const SUIT_PATH = {
  s: 'M12 2C9 7 3 10 3 15a4.5 4.5 0 0 0 8 2.8L10 22h4l-1-4.2A4.5 4.5 0 0 0 21 15c0-5-6-8-9-13z',
  h: 'M12 21C6 16 2 12.5 2 8.2 2 5.3 4.3 3 7.1 3c2 0 3.8 1.1 4.9 2.8C13.1 4.1 14.9 3 16.9 3 19.7 3 22 5.3 22 8.2c0 4.3-4 7.8-10 12.8z',
  d: 'M12 2l8 10-8 10-8-10z',
  c: 'M12 2.5a4.3 4.3 0 0 0-3.4 7A4.3 4.3 0 1 0 10.8 17L10 22h4l-.8-5a4.3 4.3 0 1 0 2.2-7.5A4.3 4.3 0 0 0 12 2.5z',
};
const RED_SUITS = 'hd';
const RANK_TXT = { T: '10', J: 'V', Q: 'D', K: 'R', A: 'A' };
const RANK_NAME = { A: 'As', T: '10', J: 'Valet', Q: 'Dame', K: 'Roi' };
const SUIT_NAME = { s: 'pique', h: 'cœur', d: 'carreau', c: 'trèfle' };

export function cardSVG(code, cls = '') {
  if (!code || code === '??') {
    return `<svg class="pcard ${cls}" viewBox="0 0 50 70" role="img" aria-label="Carte cachée">
      <defs><pattern id="cb" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#de0607"/><rect width="3" height="3" fill="#a80405"/></pattern></defs>
      <rect x="0.5" y="0.5" width="49" height="69" rx="5" fill="#f0f0e6"/>
      <rect x="3.5" y="3.5" width="43" height="63" rx="3" fill="url(#cb)" stroke="#ffbf17" stroke-width="1.2"/>
      <circle cx="25" cy="35" r="8" fill="#181818" stroke="#ffbf17" stroke-width="1.2"/>
      <path d="M21 35h8M25 31v8" stroke="#ffbf17" stroke-width="1.4"/></svg>`;
  }
  const r = code[0], s = code[1];
  const col = RED_SUITS.includes(s) ? '#de0607' : '#181818';
  const txt = RANK_TXT[r] || r;
  const pip = (x, y, size, rot = 0) => `<path d="${SUIT_PATH[s]}" fill="${col}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})${rot ? ` rotate(180 12 12)` : ''}"/>`;
  let center;
  if ('JQK'.includes(r)) {
    center = `<rect x="11" y="14" width="28" height="42" rx="2" fill="none" stroke="${col}" stroke-width="1"/>
      <rect x="13" y="16" width="24" height="38" rx="1.5" fill="${col}" opacity="0.1"/>
      <text x="25" y="41" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="20" fill="${col}">${txt}</text>
      ${pip(25, 22, 7)}${pip(25, 49, 7, 1)}`;
  } else if (r === 'A') {
    center = pip(25, 35, 22);
  } else {
    const n = +(r === 'T' ? 10 : r);
    const L = { 2: [[25, 18], [25, 52]], 3: [[25, 18], [25, 35], [25, 52]], 4: [[17, 18], [33, 18], [17, 52], [33, 52]],
      5: [[17, 18], [33, 18], [25, 35], [17, 52], [33, 52]], 6: [[17, 18], [33, 18], [17, 35], [33, 35], [17, 52], [33, 52]],
      7: [[17, 18], [33, 18], [25, 26], [17, 35], [33, 35], [17, 52], [33, 52]],
      8: [[17, 18], [33, 18], [25, 26], [17, 35], [33, 35], [25, 44], [17, 52], [33, 52]],
      9: [[17, 17], [33, 17], [17, 29], [33, 29], [25, 35], [17, 41], [33, 41], [17, 53], [33, 53]],
      10: [[17, 17], [33, 17], [25, 23], [17, 29], [33, 29], [17, 41], [33, 41], [25, 47], [17, 53], [33, 53]] }[n];
    center = L.map(([x, y]) => pip(x, y, 9, y > 36)).join('');
  }
  const label = `${RANK_NAME[r] || r} de ${SUIT_NAME[s]}`;
  return `<svg class="pcard ${cls}" viewBox="0 0 50 70" role="img" aria-label="${label}">
    <rect x="0.5" y="0.5" width="49" height="69" rx="5" fill="#f0f0e6" stroke="#c9c9bd"/>
    <text x="4.5" y="11" font-family="DM Sans, Arial, sans-serif" font-weight="800" font-size="9" fill="${col}">${txt}</text>
    ${pip(7.5, 16.5, 6)}
    <g transform="rotate(180 25 35)"><text x="4.5" y="11" font-family="DM Sans, Arial, sans-serif" font-weight="800" font-size="9" fill="${col}">${txt}</text>${pip(7.5, 16.5, 6)}</g>
    ${center}</svg>`;
}

// ---------- champ de mise (½, 2×, max) ----------
export function betControl({ input = 'bet', half = 'half', double = 'double', max = 'betMax', initial = 1 } = {}) {
  const el = document.getElementById(input);
  let bet = initial;
  const write = () => { el.value = nf2.format(bet).replace(/\s/g, ''); };
  const read = () => {
    let v = parseFloat(String(el.value).replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(v) || v < 0.1) v = 0.1;
    bet = Math.min(1000, Math.round(v * 100) / 100);
  };
  el.addEventListener('change', () => { read(); write(); });
  document.getElementById(half).addEventListener('click', () => { read(); bet = Math.max(0.1, Math.round(bet / 2 * 100) / 100); write(); });
  document.getElementById(double).addEventListener('click', () => {
    read();
    bet = Math.max(0.1, Math.min(1000, Math.round(bet * 200) / 100, Math.floor(casino.shownBalance() * 100) / 100 || 0.1));
    write();
  });
  const showMax = () => { const m = document.getElementById(max); if (m) m.textContent = 'max ' + eur(casino.shownBalance()); };
  casino.on('me', showMax);
  showMax();
  write();
  return { get() { read(); write(); return bet; }, showMax };
}

// ---------- statistiques de session ----------
export function sessionStats(fmtBest = (x) => '×' + nfx.format(x)) {
  const s = { count: 0, wager: 0, profit: 0, best: 0 };
  const draw = () => {
    const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
    set('sCount', String(s.count));
    set('sWager', eur(s.wager));
    set('sBest', s.best ? fmtBest(s.best) : '–');
    const p = document.getElementById('sProfit');
    if (p) { p.textContent = (s.profit > 0.004 ? '+' : '') + eur(s.profit); p.className = s.profit > 0.004 ? 'pos' : s.profit < -0.004 ? 'neg' : ''; }
  };
  draw();
  return { add(bet, payout, best = 0) { s.count++; s.wager += bet; s.profit += payout - bet; if (best > s.best) s.best = best; draw(); } };
}

// Barre d'usure : les zones que ce skin ne peut pas atteindre sont grisées et hachurées,
// le trait blanc montre le float tiré.
export function floatBar(it) {
  const segs = [['#3ddc5f', 0, 0.07], ['#a7e05a', 0.07, 0.15], ['#ffbf17', 0.15, 0.38], ['#ff8a3d', 0.38, 0.45], ['#de0607', 0.45, 1]];
  const bar = segs.map(([c, a, b]) => `<i style="width:${(b - a) * 100}%;background:${c}"></i>`).join('');
  const [lo, hi] = it.range || [0, 1];
  const out = (lo > 0 ? `<span class="fout" style="left:0;width:${lo * 100}%"></span>` : '') + (hi < 1 ? `<span class="fout" style="left:${hi * 100}%;right:0"></span>` : '');
  return `<div class="floatbar" aria-hidden="true">${bar}${out}<b class="fmark" style="left:${it.float * 100}%"></b></div>`;
}
