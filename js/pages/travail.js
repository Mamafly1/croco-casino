// Page Travail : les 3 tâches du jour. Chaque tâche est un petit jeu de bureau ; le serveur vérifie la réponse et paie.
import { casino, mountShell, $, eur, esc, toast, sfx } from '../core.js';
import { makeTask } from '../engine/work.js';
import { pixelIcon } from '../icons.js';

mountShell('work');

let day = null, open = -1, answer = null;

async function load() {
  try {
    day = await casino.play('work', 'today');
    renderJobs();
  } catch (e) {
    $('dayInfo').textContent = e.message;
  }
}
if (!casino.online) load();
casino.on('status', (s) => { if (s === 'online') load(); });
casino.on('me', (me) => { const b = $('bankNow'); if (b) b.textContent = eur(me.bank || 0); });

function renderJobs() {
  const total = day.tasks.reduce((s, t) => s + t.pay, 0), got = day.tasks.filter((t) => t.done).reduce((s, t) => s + t.pay, 0);
  const left = day.tasks.filter((t) => !t.done).length;
  $('dayInfo').innerHTML = (left
    ? `3 tâches aujourd’hui, payées <b>${eur(total)}</b> en tout sur ton compte en banque. Déjà gagné : <b>${eur(got)}</b>. Les tâches changent à minuit.`
    : `Journée finie : tu as gagné <b>${eur(got)}</b>. Reviens demain pour de nouvelles tâches.`) +
    `<span class="bank-line" style="margin-top:8px"><span>Compte en banque : <b id="bankNow">${eur(casino.me.bank || 0)}</b></span><button class="btn-main" id="depNow" type="button" style="width:auto;padding:8px 14px">Déposer au casino</button></span>`;
  $('depNow').addEventListener('click', () => casino.openDeposit());
  $('jobs').innerHTML = day.tasks.map((t, i) => {
    const k = makeTask(t.type, t.seed);
    return `<button type="button" class="job${t.done ? ' done' : ''}${i === open ? ' on' : ''}" data-i="${i}"${t.done ? ' disabled' : ''}>
      ${pixelIcon('work', 22)}<b>${esc(k.title)}</b><span class="pay">${eur(t.pay)}</span><span class="st">${t.done ? 'Fait ✓' : i === open ? 'En cours' : 'À faire'}</span></button>`;
  }).join('');
}
$('jobs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b || b.disabled) return;
  start(+b.dataset.i);
});

function start(i) {
  open = i;
  renderJobs();
  const t = day.tasks[i], k = makeTask(t.type, t.seed), box = $('task');
  box.hidden = false;
  box.innerHTML = `<h2>${esc(k.title)} · ${eur(t.pay)}</h2><p class="brief">${esc(k.brief)}</p><div id="tbody"></div>
    <p class="tmsg" id="tmsg"></p><div class="check-row"><button class="btn-main" id="tgo" type="button">Valider</button></div>`;
  answer = R[t.type](k, $('tbody'));
  $('tgo').addEventListener('click', submit);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submit() {
  const i = open, t = day.tasks[i];
  $('tgo').disabled = true;
  $('tmsg').textContent = '';
  try {
    const r = await casino.play('work', 'submit', { i, ans: answer() });
    day = r;
    sfx.play('up'); sfx.gain(true, 0.8);
    toast(`Tâche réussie : +${eur(t.pay)} sur ton compte en banque`);
    open = -1;
    $('task').hidden = true;
    renderJobs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    $('tmsg').textContent = e.message;
    sfx.play('lose', { vol: 0.8 });
    $('tgo').disabled = false;
  }
}

// ---------- les tâches ----------
const postit = (title, items, ordered) => `<div class="postit">${title}<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}></div>`;
const options = (list, empty = 'Choisir…') => `<option value="">${empty}</option>` + list.map((x) => `<option>${esc(x)}</option>`).join('');

const FILE_ICO = {
  dir: '<svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true"><path d="M1 3h7l2 2h11v12H1z" fill="#ffbf17" stroke="#b07a00"/></svg>',
  file: (n) => {
    const e = n.split('.').pop();
    const c = { pdf: '#de0607', jpg: '#3ddc5f', png: '#3ddc5f', mp3: '#8847ff', mp4: '#8847ff', docx: '#4b69ff', xlsx: '#1b7a43', pptx: '#e47a3c', tmp: '#8a8a80', zip: '#b07a00', txt: '#555' }[e] || '#555';
    return `<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><path d="M1 1h11l5 5v15H1z" fill="#fff" stroke="#555"/><rect x="3" y="12" width="12" height="6" fill="${c}"/></svg>`;
  },
};

const R = {
  // PC de quelqu'un : naviguer, créer, renommer, couper/coller, supprimer
  files(k, root) {
    let tree = k.tree.slice(), cwd = '', sel = null, clip = null, naming = null;
    root.innerHTML = postit(`Note de ${esc(k.owner)} :`, k.steps, true) + `
      <div class="ex" style="margin-top:12px">
        <div class="ex-title"><span>PC DE ${esc(k.owner.toUpperCase())}</span><span>_ □ ×</span></div>
        <div class="ex-bar">
          <button type="button" data-a="up">↑ Retour</button><button type="button" data-a="open">Ouvrir</button>
          <button type="button" data-a="new">Nouveau dossier</button><button type="button" data-a="ren">Renommer</button>
          <button type="button" data-a="cut">Couper</button><button type="button" data-a="paste">Coller ici</button><button type="button" data-a="del">Supprimer</button>
        </div>
        <form class="ex-name" hidden><input aria-label="Nom" autocomplete="off"><button type="submit">OK</button><button type="button" data-a="cancel">Annuler</button></form>
        <div class="ex-path"></div><ul class="ex-list"></ul>
      </div>`;
    const ex = root.querySelector('.ex'), form = ex.querySelector('.ex-name'), input = form.querySelector('input');
    const name = (p) => p.replace(/\/$/, '').split('/').pop();
    const inDir = (p) => { const s = p.replace(/\/$/, ''); const i = s.lastIndexOf('/'); return (i < 0 ? '' : s.slice(0, i + 1)) === cwd; };
    const exists = (n) => tree.some((p) => inDir(p) && name(p).toLowerCase() === n.toLowerCase());
    const draw = () => {
      const items = tree.filter(inDir).sort((a, b) => (b.endsWith('/') - a.endsWith('/')) || a.localeCompare(b));
      ex.querySelector('.ex-path').textContent = 'Bureau' + (cwd ? ' › ' + cwd.replace(/\/$/, '').split('/').join(' › ') : ' (racine)');
      ex.querySelector('.ex-list').innerHTML = items.length ? items.map((p) => `<li><button type="button" data-p="${esc(p)}" class="${p === sel ? 'sel' : ''}${p === clip ? ' cut' : ''}">${p.endsWith('/') ? FILE_ICO.dir : FILE_ICO.file(p)}${esc(name(p))}</button></li>`).join('') : '<li class="ex-empty">Dossier vide</li>';
      const b = (a) => ex.querySelector(`[data-a="${a}"]`);
      b('up').disabled = !cwd; b('open').disabled = !(sel && sel.endsWith('/'));
      b('ren').disabled = b('del').disabled = b('cut').disabled = !sel; b('paste').disabled = !clip;
    };
    const ask = (mode, value) => { naming = mode; form.hidden = false; input.value = value; input.focus(); input.select(); };
    ex.querySelector('.ex-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]'); if (!b) return;
      const p = b.dataset.p;
      if (p === sel && p.endsWith('/')) { cwd = p; sel = null; } else sel = p;
      draw();
    });
    ex.querySelector('.ex-bar').addEventListener('click', (e) => {
      const a = e.target.closest('button[data-a]'); if (!a) return;
      const act = a.dataset.a;
      if (act === 'up') { const s = cwd.replace(/\/$/, ''); cwd = s.includes('/') ? s.slice(0, s.lastIndexOf('/') + 1) : ''; sel = null; }
      if (act === 'open' && sel) { cwd = sel; sel = null; }
      if (act === 'new') return ask('new', 'Nouveau dossier');
      if (act === 'ren' && sel) return ask('ren', name(sel));
      if (act === 'cut' && sel) clip = sel;
      if (act === 'paste' && clip) {
        const isDir = clip.endsWith('/'), n = name(clip);
        if (isDir && cwd.startsWith(clip)) { $('tmsg').textContent = 'Impossible de mettre un dossier dans lui-même.'; return; }
        if (exists(n)) { $('tmsg').textContent = `Il y a déjà « ${n} » ici.`; return; }
        const dest = cwd + n + (isDir ? '/' : '');
        tree = tree.map((p) => (p === clip ? dest : isDir && p.startsWith(clip) ? dest + p.slice(clip.length) : p));
        clip = null; sel = dest;
      }
      if (act === 'del' && sel) { const s = sel; tree = tree.filter((p) => p !== s && !(s.endsWith('/') && p.startsWith(s))); if (clip && clip.startsWith(s)) clip = null; sel = null; }
      $('tmsg').textContent = '';
      draw();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = input.value.trim().replace(/[\\/]/g, '');
      if (!n) return;
      if (naming === 'new') {
        if (exists(n)) { $('tmsg').textContent = `Il y a déjà « ${n} » ici.`; return; }
        tree.push(cwd + n + '/'); sel = cwd + n + '/';
      } else if (sel) {
        const isDir = sel.endsWith('/');
        if (n.toLowerCase() !== name(sel).toLowerCase() && exists(n)) { $('tmsg').textContent = `Il y a déjà « ${n} » ici.`; return; }
        const dest = cwd + n + (isDir ? '/' : ''), old = sel;
        tree = tree.map((p) => (p === old ? dest : isDir && p.startsWith(old) ? dest + p.slice(old.length) : p));
        if (clip === old) clip = dest;
        sel = dest;
      }
      form.hidden = true; $('tmsg').textContent = '';
      draw();
    });
    form.querySelector('[data-a="cancel"]').addEventListener('click', () => { form.hidden = true; });
    draw();
    return () => tree;
  },

  mailsort(k, root) {
    root.innerHTML = postit('Post-it collé sur l’écran :', k.note) + `<div class="rows" style="margin-top:12px">${k.mails.map((m, i) => `
      <div class="row"><span><span class="who">${esc(m.from)}</span> · <span class="sub">${esc(m.subject)}</span></span>
      <select class="text-in" data-i="${i}" aria-label="Dossier pour le mail de ${esc(m.from)}">${options(k.boxes, 'Ranger dans…')}</select></div>`).join('')}</div>`;
    return () => [...root.querySelectorAll('select')].map((s) => s.value);
  },

  mailreply(k, root) {
    root.innerHTML = `<div class="ref">
      <div class="card2"><b>AGENDA</b><table>${k.meetings.map((m) => `<tr><td>${esc(m.t)}</td><td>${esc(m.h)}</td><td>${esc(m.room)}</td></tr>`).join('')}</table></div>
      <div class="card2"><b>CATALOGUE</b><table>${k.cat.map((c) => `<tr><td>${esc(c.n)}</td><td>${esc(c.price)}</td></tr>`).join('')}</table></div>
      <div class="card2"><b>ANNUAIRE</b><table>${k.phones.map((p) => `<tr><td>${esc(p.n)}</td><td>poste ${esc(p.ext)}</td></tr>`).join('')}</table></div>
    </div><div class="rows" style="margin-top:12px">${k.mails.map((m, i) => `
      <div class="row"><span><span class="who">${esc(m.from)}</span> : « ${esc(m.q)} »</span>
      <div class="opts" role="radiogroup">${m.opts.map((o, j) => `<label><input type="radio" name="r${i}" value="${j}">${esc(o)}</label>`).join('')}</div></div>`).join('')}</div>`;
    return () => k.mails.map((_, i) => { const c = root.querySelector(`input[name="r${i}"]:checked`); return c ? +c.value : -1; });
  },

  change(k, root) {
    const given = k.clients.map(() => []);
    root.innerHTML = `<div class="till">${k.clients.map((c, i) => `
      <div class="client" data-i="${i}"><span><b>${esc(c.who)}</b> achète ${esc(c.what)} à <b>${eur(c.price)}</b> et paie avec <b>${eur(c.paid)}</b>.</span>
      <div class="coins">${k.coins.map((v) => `<button type="button" class="${v >= 5 ? 'note' : ''}" data-v="${v}">${v >= 1 ? v + ' €' : Math.round(v * 100) + ' c'}</button>`).join('')}</div>
      <div class="check-row"><span class="given">Tu rends : <span data-g>0,00 €</span></span><button type="button" class="btn-ghost" data-clear>Reprendre</button></div></div>`).join('')}</div>`;
    root.addEventListener('click', (e) => {
      const c = e.target.closest('.client'); if (!c) return;
      const i = +c.dataset.i, v = e.target.closest('[data-v]');
      if (v) given[i].push(Math.round(+v.dataset.v * 100));
      if (e.target.closest('[data-clear]')) given[i] = [];
      c.querySelector('[data-g]').textContent = eur(given[i].reduce((a, b) => a + b, 0) / 100);
    });
    return () => given.map((g) => g.reduce((a, b) => a + b, 0));
  },

  stamp(k, root) {
    const on = new Set();
    root.innerHTML = postit('Règle du jour :', [k.rule]) + `<div class="invs" style="margin-top:12px">${k.invoices.map((f, i) => `
      <button type="button" class="inv" data-i="${i}" aria-pressed="false"><b>FACTURE ${esc(f.num)}</b><span>${esc(f.sup)}</span><span>${esc(f.month)}</span>
      <span><b style="font-size:11px">${f.amount} €</b></span><span class="${f.signed ? 'sig' : 'nosig'}">${f.signed ? 'Signée' : 'Pas signée'}</span></button>`).join('')}</div>`;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.inv'); if (!b) return;
      const i = +b.dataset.i;
      if (on.has(i)) on.delete(i); else on.add(i);
      b.classList.toggle('on', on.has(i)); b.setAttribute('aria-pressed', String(on.has(i)));
    });
    return () => [...on].sort((a, b) => a - b);
  },

  sheet(k, root) {
    root.innerHTML = `<div style="overflow-x:auto"><table class="xl"><thead><tr><th>Ville</th><th>Vendeur</th><th>Ventes</th></tr></thead><tbody>
      ${k.rows.map((r) => `<tr><td>${esc(r.city)}</td><td>${esc(r.seller)}</td><td class="n">${r.n}</td></tr>`).join('')}</tbody></table></div>
      <div class="qs" style="margin-top:12px">${k.qs.map((q, i) => `<label>${esc(q)}<input inputmode="numeric" data-i="${i}" autocomplete="off"></label>`).join('')}</div>`;
    return () => [...root.querySelectorAll('.qs input')].map((x) => x.value.trim());
  },

  cables(k, root) {
    const link = k.left.map(() => -1);
    let pick = -1;
    root.innerHTML = `<div class="wires"><svg aria-hidden="true"></svg>
      <div class="col">${k.left.map((c, i) => `<button type="button" class="plug" data-l="${i}" style="background:${k.colors[c]}" aria-label="Câble ${c}">${esc(c)}</button>`).join('')}</div>
      <div class="col">${k.right.map((c, i) => `<button type="button" class="plug${k.label ? ' lab' : ''}" data-r="${i}" style="background:${k.colors[c]}" aria-label="Prise ${c}">${esc(c)}</button>`).join('')}</div></div>`;
    const wrap = root.querySelector('.wires'), svg = wrap.querySelector('svg');
    const draw = () => {
      const W = wrap.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${W.width} ${W.height}`);
      svg.innerHTML = link.map((r, l) => {
        if (r < 0) return '';
        const a = wrap.querySelector(`[data-l="${l}"]`).getBoundingClientRect(), b = wrap.querySelector(`[data-r="${r}"]`).getBoundingClientRect();
        const x1 = a.right - W.left, y1 = a.top + a.height / 2 - W.top, x2 = b.left - W.left, y2 = b.top + b.height / 2 - W.top;
        return `<path d="M${x1} ${y1}C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}" stroke="${k.colors[k.left[l]]}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      }).join('');
      wrap.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('sel', +b.dataset.l === pick));
    };
    wrap.addEventListener('click', (e) => {
      const l = e.target.closest('[data-l]'), r = e.target.closest('[data-r]');
      if (l) pick = +l.dataset.l;
      if (r && pick >= 0) { const ri = +r.dataset.r; for (let i = 0; i < link.length; i++) if (link[i] === ri) link[i] = -1; link[pick] = ri; pick = link.indexOf(-1); }
      draw();
    });
    addEventListener('resize', draw);
    requestAnimationFrame(draw);
    return () => link;
  },

  code(k, root) {
    root.innerHTML = `<div class="codes">${k.codes.map((c, i) => `<div class="codebox">${esc(c)}</div><input data-i="${i}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code ${i + 1}">`).join('')}</div>`;
    // une touche de clavier à chaque lettre (6 touches différentes, hauteur et force qui varient ; plus sourd pour effacer)
    root.addEventListener('input', (e) => {
      const del = /^delete/.test(e.inputType || '');
      sfx.play('key', { vol: 0.75 + Math.random() * 0.25, rate: del ? 0.85 : 1, vary: 0.07, gap: 15 });
    });
    return () => [...root.querySelectorAll('input')].map((x) => x.value);
  },

  count(k, root) {
    const ICO = {
      carton: '<svg width="26" height="26" viewBox="0 0 9 9" shape-rendering="crispEdges"><rect x="1" y="2" width="7" height="6" fill="#b07a00"/><rect x="1" y="2" width="7" height="1" fill="#ffbf17"/><rect x="4" y="2" width="1" height="6" fill="#e2c27a"/></svg>',
      bidon: '<svg width="26" height="26" viewBox="0 0 9 9" shape-rendering="crispEdges"><rect x="2" y="2" width="5" height="6" fill="#4b69ff"/><rect x="5" y="1" width="2" height="1" fill="#4b69ff"/><rect x="3" y="3" width="1" height="4" fill="#9fb0ff"/></svg>',
      palette: '<svg width="26" height="26" viewBox="0 0 9 9" shape-rendering="crispEdges"><rect x="0" y="4" width="9" height="1" fill="#c9a26a"/><rect x="0" y="6" width="9" height="1" fill="#c9a26a"/><rect x="1" y="5" width="1" height="1" fill="#8a6a3a"/><rect x="4" y="5" width="1" height="1" fill="#8a6a3a"/><rect x="7" y="5" width="1" height="1" fill="#8a6a3a"/></svg>',
      extincteur: '<svg width="26" height="26" viewBox="0 0 9 9" shape-rendering="crispEdges"><rect x="3" y="2" width="3" height="6" fill="#de0607"/><rect x="4" y="1" width="2" height="1" fill="#181818"/><rect x="6" y="1" width="2" height="1" fill="#181818"/></svg>',
    };
    const TAG = { vert: '#3ddc5f', rouge: '#ff6f6f' };
    root.innerHTML = `<p class="muted small">Étiquettes : <span style="color:#3ddc5f">■ verte</span> · <span style="color:#ff6f6f">■ rouge</span></p>
      <div class="wh">${k.items.map((x) => `<span title="${x.k}${x.tag ? ', étiquette ' + x.tag : ''}">${ICO[x.k]}${x.tag ? `<i style="background:${TAG[x.tag]}"></i>` : ''}</span>`).join('')}</div>
      <div class="qs" style="margin-top:12px">${k.qs.map((q, i) => `<label>${esc(q)}<input inputmode="numeric" data-i="${i}" autocomplete="off"></label>`).join('')}</div>`;
    return () => [...root.querySelectorAll('.qs input')].map((x) => x.value.trim());
  },

  antivirus(k, root) {
    const on = new Set(), q = !!k.files[0].size;
    root.innerHTML = `<div class="invs">${k.files.map((f, i) => `
      <button type="button" class="inv${q ? ' q' : ''}" data-i="${i}" aria-pressed="false">${FILE_ICO.file(f.n)}<span style="overflow-wrap:anywhere;font-weight:700">${esc(f.n)}</span>
      ${q ? `<span>${f.size} Mo · ${esc(f.from)}</span>` : ''}</button>`).join('')}</div>`;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.inv'); if (!b) return;
      const i = +b.dataset.i;
      if (on.has(i)) on.delete(i); else on.add(i);
      b.classList.toggle('on', on.has(i)); b.setAttribute('aria-pressed', String(on.has(i)));
    });
    if (!q) root.insertAdjacentHTML('afterbegin', '<p class="muted small">Touche un fichier pour le marquer comme virus.</p>');
    return () => [...on].sort((a, b) => a - b);
  },

  phone(k, root) {
    root.innerHTML = `<div class="ref"><div class="card2"><b>FICHE DU STANDARD</b><table>${Object.entries(k.guide).map(([s, ks]) => `<tr><td><b style="font:inherit;font-weight:800;display:inline">${esc(s)}</b></td><td>${ks.map(esc).join(', ')}</td></tr>`).join('')}</table></div></div>
      <div class="rows" style="margin-top:12px">${k.calls.map((c, i) => `<div class="row"><span><span class="who">${esc(c.who)}</span> : « ${esc(c.text)} »</span>
      <select class="text-in" data-i="${i}" aria-label="Service pour l’appel de ${esc(c.who)}">${options(k.services, 'Transférer à…')}</select></div>`).join('')}</div>`;
    return () => [...root.querySelectorAll('select')].map((s) => s.value);
  },

  printer(k, root) {
    const typed = [];
    let replays = 1, showing = false;
    root.innerHTML = `<div class="printer"><div class="screen" id="pscreen">APPUIE SUR « VOIR LA COMBINAISON »</div>
      <div class="keys">${k.keys.map((n, i) => `<button type="button" data-k="${i}">${esc(n)}</button>`).join('')}</div>
      <div class="check-row" style="width:100%"><button type="button" class="btn-ghost" id="pshow">Voir la combinaison</button><button type="button" class="btn-ghost" id="pclear">Effacer</button></div></div>`;
    const keys = [...root.querySelectorAll('[data-k]')], scr = root.querySelector('#pscreen');
    const screen = () => { scr.textContent = typed.length ? typed.map((i) => k.keys[i]).join(' › ') : 'À TOI'; };
    root.querySelector('#pshow').addEventListener('click', async (e) => {
      if (showing) return;
      showing = true;
      const btn = e.currentTarget;
      btn.disabled = true;
      scr.textContent = 'REGARDE BIEN…';
      for (const i of k.seq) {
        await new Promise((r) => setTimeout(r, 250));
        keys[i].classList.add('lit');
        await new Promise((r) => setTimeout(r, 550));
        keys[i].classList.remove('lit');
      }
      showing = false;
      typed.length = 0;
      screen();
      if (replays-- > 0) { btn.disabled = false; btn.textContent = 'Revoir (1 fois)'; } else btn.textContent = 'Plus de revoir';
    });
    root.querySelector('#pclear').addEventListener('click', () => { typed.length = 0; screen(); });
    root.querySelector('.keys').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b || showing) return;
      typed.push(+b.dataset.k);
      b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 160);
      screen();
    });
    return () => typed.slice();
  },
};
