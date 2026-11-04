// Page Bourse : Caca Cola, Children, Peer. Le cours vient du serveur (ou du navigateur en solo).
import { casino, mountShell, $, eur, nf2, esc, toast } from '../core.js';
import { mountFeed, betControl } from '../widgets.js';
import { COMPANIES, FEE } from '../engine/market.js';

mountShell('stocks');
mountFeed($('feed'), { game: 'stocks', limit: 8 });
const amount = betControl({ initial: 10 });

export const LOGOS = {
  // fond rouge, écriture blanche penchée
  caca: '<svg viewBox="0 0 120 46" aria-hidden="true"><rect width="120" height="46" fill="#de0607"/><path d="M0 34c30-10 60 8 120-6v18H0z" fill="#fff" opacity=".9"/><path d="M0 37c30-10 60 8 120-6" stroke="#de0607" stroke-width="2" fill="none"/><text x="60" y="27" text-anchor="middle" font-family="Brush Script MT, Segoe Script, cursive" font-style="italic" font-weight="700" font-size="22" fill="#fff">Caca Cola</text></svg>',
  // façon Kinder : le C en noir, le reste en rouge, sur blanc
  children: '<svg viewBox="0 0 120 46" aria-hidden="true"><rect width="120" height="46" fill="#fff"/><text x="60" y="31" text-anchor="middle" font-family="DM Sans, Arial Rounded MT Bold, Arial, sans-serif" font-weight="800" font-size="23" letter-spacing="-0.5"><tspan fill="#181818">C</tspan><tspan fill="#de0607">hildren</tspan></text></svg>',
  // une poire croquée, comme une pomme célèbre
  peer: '<svg viewBox="0 0 120 46" aria-hidden="true"><rect width="120" height="46" fill="#1d1d1f"/><g transform="translate(46 4)" fill="#d6d6d6"><path d="M14 9c-1-4 1-7 5-8-1 4-2 6-5 8z"/><path d="M14 10c-4 0-6 3-6 7 0 3-6 6-6 13 0 6 5 10 12 10s12-4 12-10c0-7-6-10-6-13 0-1-.3-2-.7-3a4 4 0 1 1-3.6-4H14z"/></g><text x="84" y="28" font-family="DM Sans, Arial, sans-serif" font-weight="700" font-size="13" fill="#d6d6d6">Peer</text></svg>',
};

let mk = null, sel = 'caca', span = 60;
const pctTxt = (x) => (x > 0 ? '+' : '') + nf2.format(x) + ' %';
const change = (id, mins) => { const h = mk.hist[id]; const a = h[Math.max(0, h.length - 1 - mins)], b = h[h.length - 1]; return a ? ((b - a) / a) * 100 : 0; };

async function refresh() {
  try { mk = await casino.market(); render(); } catch (e) { $('msg').textContent = e.message; }
}
function render() {
  if (!mk) return;
  $('cos').innerHTML = COMPANIES.map((c) => {
    const ch = change(c.id, 60);
    return `<button type="button" class="co" data-co="${c.id}" aria-pressed="${c.id === sel}"><span class="logo">${LOGOS[c.id]}</span>
      <span class="px2">${nf2.format(mk.prices[c.id])} €</span><small class="${ch >= 0 ? 'up' : 'down'}">${pctTxt(ch)} (1 h)</small></button>`;
  }).join('');
  const c = COMPANIES.find((x) => x.id === sel), ch = change(sel, span);
  $('coName').innerHTML = `<b style="font:inherit;font-weight:800">${esc(c.name)}</b> <span class="muted">· ${esc(c.sector)}</span>`;
  $('coPrice').textContent = nf2.format(mk.prices[sel]) + ' €';
  $('coChg').innerHTML = `<span class="${ch >= 0 ? 'up' : 'down'}">${pctTxt(ch)}</span>`;
  chart();
  $('news').innerHTML = mk.news.length ? mk.news.map((n) => {
    const co = COMPANIES.find((x) => x.id === n.co);
    return `<li><time>${new Date(n.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time><span><b>${esc(co ? co.name : '')}</b> : ${esc(n.text)}</span><span class="${n.pct >= 0 ? 'up' : 'down'}">${pctTxt(n.pct)}</span></li>`;
  }).join('') : '<li><span></span><span class="muted">Pas d’actu pour l’instant.</span><span></span></li>';
  holdings();
}
function chart() {
  const h = mk.hist[sel].slice(-span - 1);
  const W = 640, H = 220, L = 46, R = 8, T = 10, B = 20;
  let lo = Math.min(...h), hi = Math.max(...h);
  if (hi - lo < 0.01) { hi += 0.5; lo -= 0.5; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const x = (i) => L + (h.length > 1 ? i / (h.length - 1) : 1) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const d = h.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const up = h[h.length - 1] >= h[0];
  const col = up ? '#3ddc5f' : '#ff6f6f';
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  $('chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cours sur ${span / 60} h">
    ${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${nf2.format(v)}</text>`).join('')}
    <path d="${d}L${x(h.length - 1)},${H - B}L${L},${H - B}Z" fill="${col}" opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>
    <text class="tick" x="${L}" y="${H - 4}">il y a ${span >= 60 ? span / 60 + ' h' : span + ' min'}</text><text class="tick" x="${W - R}" y="${H - 4}" text-anchor="end">maintenant</text></svg>`;
}
function holdings() {
  const st = casino.me.stocks || {}, h = st[sel];
  const c = COMPANIES.find((x) => x.id === sel);
  $('buy').textContent = `Acheter ${c.name}`;
  if (h && h.sh > 0) {
    const val = h.sh * mk.prices[sel] * (1 - FEE), pl = val - h.cost;
    $('hold').innerHTML = `<div><span>Tes actions ${esc(c.name)}</span><b>${nf2.format(h.sh)}</b></div><div><span>Payé</span><b>${eur(h.cost)}</b></div>
      <div><span>Si tu vends maintenant</span><b class="${pl >= 0 ? 'up' : 'down'}">${eur(val)} (${pl >= 0 ? '+' : ''}${eur(pl)})</b></div>`;
    $('sell').hidden = false; $('sell').textContent = `Tout vendre (${eur(val)})`;
  } else { $('hold').innerHTML = `<div><span class="muted">Tu n’as pas d’actions ${esc(c.name)}.</span></div>`; $('sell').hidden = true; }
  const rows = COMPANIES.filter((x) => st[x.id] && st[x.id].sh > 0).map((x) => `<div><span>${esc(x.name)}</span><b>${eur(st[x.id].sh * mk.prices[x.id])}</b></div>`);
  $('wallet2').innerHTML = rows.length ? rows.join('') : '<div><span class="muted">Aucune action.</span></div>';
}

$('cos').addEventListener('click', (e) => { const b = e.target.closest('[data-co]'); if (b) { sel = b.dataset.co; render(); } });
document.querySelector('[aria-label="Durée"]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-span]'); if (!b) return;
  span = +b.dataset.span;
  document.querySelectorAll('[data-span]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
});
$('buy').addEventListener('click', async () => {
  $('msg').textContent = '';
  try {
    const r = await casino.play('stocks', 'buy', { co: sel, amount: amount.get() });
    toast(`Acheté ${nf2.format(r.sh)} actions à ${eur(r.price)}`);
    await refresh();
  } catch (e) { $('msg').textContent = e.message; if (/Solde insuffisant/.test(e.message)) casino.nudgeDeposit(); }
});
$('sell').addEventListener('click', async () => {
  $('msg').textContent = '';
  try {
    const r = await casino.play('stocks', 'sell', { co: sel, all: true });
    toast(`Vendu pour ${eur(r.proceeds)} (${r.gain >= 0 ? '+' : ''}${eur(r.gain)})`);
    await refresh();
  } catch (e) { $('msg').textContent = e.message; }
});
casino.on('me', () => { if (mk) holdings(); });
if (!casino.online) refresh();
casino.on('status', (s) => { if (s === 'online') refresh(); });
setInterval(() => { if (!document.hidden && (casino.status === 'online' || !casino.online)) refresh(); }, 20000);
