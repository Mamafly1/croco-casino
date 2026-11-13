// Page Travail : les 3 tâches du jour. Chaque tâche est un petit jeu de bureau ; le serveur vérifie la réponse et paie.
import { casino, mountShell, $, eur, esc, toast, sfx } from '../core.js';
import { makeTask, checkTask, TASKS } from '../engine/work.js';
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
    ? `${day.tasks.length} tâches aujourd’hui, payées <b>${eur(total)}</b> en tout sur ton compte en banque. Déjà gagné : <b>${eur(got)}</b>. Les tâches changent à minuit.`
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

// une touche de clavier à chaque lettre tapée dans une tâche (6 touches différentes, hauteur et force qui varient ;
// plus sourd pour effacer)
$('task').addEventListener('input', (e) => {
  if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.type === 'radio' || e.target.type === 'checkbox') return;
  const del = /^delete/.test(e.inputType || '');
  sfx.play('key', { vol: 0.75 + Math.random() * 0.25, rate: del ? 0.85 : 1, vary: 0.07, gap: 15 });
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
    sfx.gain(true, 0.8); // petite note douce (plus de « vroum »)
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
// Glisser-déposer au doigt et à la souris. Souris : on attrape en bougeant un peu. Doigt : appui long (la page
// peut encore défiler tant qu'on n'a pas tenu), puis on glisse. On lâche sur une cible ; un clic n'est pas déclenché.
function dragDrop(root, { item, target, onDrop }) {
  let st = null, skipClick = false;
  const clear = () => {
    if (!st) return;
    clearTimeout(st.timer);
    if (st.ghost) st.ghost.remove();
    if (st.over) st.over.classList.remove('drop-over');
    st.el.classList.remove('dragging');
    document.body.classList.remove('dnd');
    st = null;
  };
  const move = (x, y) => {
    st.ghost.style.transform = `translate(${x - st.dx}px, ${y - st.dy}px)`;
    const hit = document.elementFromPoint(x, y), t = hit && hit.closest(target);
    const ok = t && t !== st.el && root.contains(t) ? t : null;
    if (ok !== st.over) { if (st.over) st.over.classList.remove('drop-over'); if (ok) ok.classList.add('drop-over'); st.over = ok; }
  };
  const begin = () => {
    st.ready = true;
    if (navigator.vibrate) navigator.vibrate(12);
    const r = st.el.getBoundingClientRect(), g = st.el.cloneNode(true);
    g.classList.add('drag-ghost'); g.style.width = r.width + 'px';
    document.body.appendChild(g);
    Object.assign(st, { ghost: g, dx: st.x0 - r.left, dy: st.y0 - r.top });
    st.el.classList.add('dragging'); document.body.classList.add('dnd');
    move(st.x0, st.y0);
  };
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(item);
    if (!el || e.button > 0) return;
    clear();
    st = { el, x0: e.clientX, y0: e.clientY, pid: e.pointerId, touch: e.pointerType !== 'mouse' };
    if (st.touch) st.timer = setTimeout(begin, 280);
  });
  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    if (!st.ready) {
      const d = Math.hypot(e.clientX - st.x0, e.clientY - st.y0);
      if (st.touch) { if (d > 10) clear(); } else if (d > 6) begin();
      return;
    }
    move(e.clientX, e.clientY);
  });
  document.addEventListener('pointerup', (e) => {
    if (!st || e.pointerId !== st.pid) return;
    const s = st, t = s.over;
    clear();
    if (s.ready) { skipClick = true; setTimeout(() => { skipClick = false; }, 0); if (t) onDrop(s.el, t); }
  });
  document.addEventListener('pointercancel', clear);
  document.addEventListener('touchmove', (e) => { if (st && st.ready) e.preventDefault(); }, { passive: false }); // pas de défilement pendant qu'on glisse
  root.addEventListener('click', (e) => { if (skipClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  root.addEventListener('contextmenu', (e) => { if (e.target.closest(item)) e.preventDefault(); });
}
const AV_COLORS = ['#4b69ff', '#de0607', '#1b7a43', '#b07a00', '#8847ff', '#e47a3c', '#0f8b8d'];
const avColor = (s) => AV_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
// barre de titre de fenêtre, avec de vrais petits boutons (réduire, agrandir, fermer)
const WIN_BTNS = '<span class="wbtns" aria-hidden="true"><svg viewBox="0 0 10 10"><path d="M1.5 8.5h7"/></svg><svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7"/></svg><svg viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg></span>';
const winTitle = (t) => `<div class="ex-title"><span>${t}</span>${WIN_BTNS}</div>`;
// contenu d'un post-it : un titre et une liste (ou du texte libre déjà prêt)
const noteList = (title, items, ordered) => `<span class="t">${title}</span><${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#3ddc5f"/><path d="M8 12l3 3 5-6" stroke="#10224d" stroke-width="2.4" fill="none"/></svg>';
// Bureau : fond d'écran (ou bureau en bois), post-it scotché qu'on touche pour l'agrandir, notification du PC, et la fenêtre
function deskScene({ main = '', note = '', notif = '', wood = false }) {
  return `<div class="desk${wood ? ' wood' : ''}">
      ${wood ? '' : '<div class="desk-icons" aria-hidden="true"><span><i></i>Documents</span><span><i></i>Croco Mail</span><span><i></i>Corbeille</span></div>'}
      <div class="desk-top">${notif ? `<div class="notif" role="status">${SHIELD}<span><b>CROCO ANTIVIRUS</b>${notif}</span></div>` : ''}${note ? `<button type="button" class="sticky" aria-label="Agrandir le post-it">${note}<span class="z">Touche pour agrandir</span></button>` : ''}</div>
      <div class="desk-main">${main}</div>
    </div>${note ? `<div class="sticky-zoom" hidden><div class="sticky" role="dialog" aria-label="Post-it agrandi">${note}<span class="z">Touche pour refermer</span></div></div>` : ''}`;
}
function wireDesk(root) {
  const z = root.querySelector('.sticky-zoom'), s = root.querySelector('.desk .sticky');
  if (!z || !s) return;
  s.addEventListener('click', () => { z.hidden = false; sfx.play('slide', { vol: 0.5 }); });
  z.addEventListener('click', () => { z.hidden = true; });
}


const FILE_ICO = {
  dir: '<svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true"><path d="M1 3h7l2 2h11v12H1z" fill="#ffbf17" stroke="#b07a00"/></svg>',
  file: (n) => {
    const e = n.split('.').pop();
    const c = { pdf: '#de0607', jpg: '#3ddc5f', png: '#3ddc5f', mp3: '#8847ff', mp4: '#8847ff', docx: '#4b69ff', xlsx: '#1b7a43', pptx: '#e47a3c', tmp: '#8a8a80', zip: '#b07a00', txt: '#555' }[e] || '#555';
    return `<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><path d="M1 1h11l5 5v15H1z" fill="#fff" stroke="#555"/><rect x="3" y="12" width="12" height="6" fill="${c}"/></svg>`;
  },
};

// espaces insécables : « », ? ! : ne se retrouvent jamais seuls en début de ligne
const nb = (t) => esc(t).replace(/ ([»?!:;])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
const R = {
  // PC de quelqu'un : naviguer, créer, renommer, couper/coller, supprimer
  files(k, root) {
    let tree = k.tree.slice(), cwd = '', sel = null, clip = null, naming = null;
    root.innerHTML = deskScene({ note: noteList(`Note de ${esc(k.owner)} :`, k.steps, true), main: `
      <div class="ex">
        ${winTitle(`PC DE ${esc(k.owner.toUpperCase())}`)}
        <div class="ex-bar">
          <button type="button" data-a="up">↑ Retour</button><button type="button" data-a="open">Ouvrir</button>
          <button type="button" data-a="new">Nouveau dossier</button><button type="button" data-a="ren">Renommer</button>
          <button type="button" data-a="cut">Couper</button><button type="button" data-a="paste">Coller ici</button><button type="button" data-a="del">Supprimer</button>
        </div>
        <form class="ex-name" hidden><input aria-label="Nom" autocomplete="off"><button type="submit">OK</button><button type="button" data-a="cancel">Annuler</button></form>
        <div class="ex-path"></div><ul class="ex-list"></ul>
        <div class="ex-hint">Astuce : maintiens un fichier ou un dossier et glisse-le sur un dossier (ou sur « ↑ Retour » pour le remonter).</div>
      </div>` });
    wireDesk(root);
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
    // déplace src (fichier ou dossier) dans le dossier dir ; renvoie son nouveau chemin, ou null si impossible
    const moveTo = (src, dir) => {
      const isDir = src.endsWith('/'), n = name(src);
      if (isDir && dir.startsWith(src)) { $('tmsg').textContent = 'Impossible de mettre un dossier dans lui-même.'; return null; }
      const parentOf = (p) => { const x = p.replace(/\/$/, ''), i = x.lastIndexOf('/'); return i < 0 ? '' : x.slice(0, i + 1); };
      if (parentOf(src) === dir) return null; // déjà là
      if (tree.some((p) => p !== src && parentOf(p) === dir && name(p).toLowerCase() === n.toLowerCase())) { $('tmsg').textContent = `Il y a déjà « ${n} » là-bas.`; return null; }
      const dest = dir + n + (isDir ? '/' : '');
      tree = tree.map((p) => (p === src ? dest : isDir && p.startsWith(src) ? dest + p.slice(src.length) : p));
      if (clip && clip.startsWith(src)) clip = null;
      $('tmsg').textContent = '';
      return dest;
    };
    dragDrop(ex, {
      item: '.ex-list button[data-p]', target: '.ex-list button[data-p$="/"], [data-a="up"]',
      onDrop: (el, t) => {
        const src = el.dataset.p;
        let dir;
        if (t.dataset.a === 'up') { if (!cwd) return; const s = cwd.replace(/\/$/, ''); dir = s.includes('/') ? s.slice(0, s.lastIndexOf('/') + 1) : ''; }
        else dir = t.dataset.p;
        if (dir === src) return;
        if (moveTo(src, dir)) { sel = null; sfx.play('switch', { vol: 0.6 }); draw(); }
      },
    });
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
      if (act === 'paste' && clip) { const d = moveTo(clip, cwd); if (!d) return; clip = null; sel = d; }
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

  // Logiciel de messagerie : on range un mail en le glissant sur un dossier, ou en le touchant puis en touchant le dossier
  mailsort(k, root) {
    const put = k.mails.map(() => '');
    let sel = 0;
    root.innerHTML = deskScene({ note: noteList('Règles de tri :', k.note), main: `
      <div class="mail">${winTitle('CROCO MAIL')}
        <div class="mail-bar"><span>Boîte de réception</span><span class="mail-search">Rechercher…</span></div>
        <div class="mail-body"><nav class="mail-folders" aria-label="Dossiers"></nav><ul class="mail-list"></ul></div>
        <div class="ex-hint">Touche un mail puis un dossier, ou glisse le mail sur le dossier.</div>
      </div>` });
    wireDesk(root);
    const fold = root.querySelector('.mail-folders'), list = root.querySelector('.mail-list');
    const draw = () => {
      const left = put.filter((x) => !x).length;
      fold.innerHTML = `<button type="button" class="inbox" disabled>Réception <em>${left}</em></button>` +
        k.boxes.map((b) => `<button type="button" data-box="${esc(b)}">${esc(b)}<em>${put.filter((x) => x === b).length || ''}</em></button>`).join('');
      list.innerHTML = k.mails.map((m, i) => `<li><button type="button" class="mail-row${i === sel ? ' sel' : ''}${put[i] ? ' done' : ''}" data-i="${i}">
        <i class="mail-av" style="--c:${avColor(m.from)}">${esc(m.from[0].toUpperCase())}</i><span><b>${esc(m.from)}</b><small>${nb(m.subject)}</small></span>
        <em class="mail-tag${put[i] ? '' : ' todo'}">${esc(put[i] || 'À ranger')}</em></button></li>`).join('');
    };
    const file = (i, box) => {
      put[i] = box;
      sfx.play('switch', { vol: 0.5 });
      const next = put.findIndex((x) => !x);
      sel = next < 0 ? -1 : next;
      draw();
    };
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { sel = +b.dataset.i; draw(); } });
    fold.addEventListener('click', (e) => { const b = e.target.closest('[data-box]'); if (b && sel >= 0) file(sel, b.dataset.box); });
    dragDrop(root.querySelector('.mail'), { item: '.mail-row', target: '[data-box]', onDrop: (el, t) => file(+el.dataset.i, t.dataset.box) });
    draw();
    return () => put.slice();
  },

  mailreply(k, root) {
    root.innerHTML = `<div class="ref">
      <div class="card2"><b>AGENDA</b><table>${k.meetings.map((m) => `<tr><td>${esc(m.t)}</td><td>${esc(m.h)}</td><td>${esc(m.room)}</td></tr>`).join('')}</table></div>
      <div class="card2"><b>CATALOGUE</b><table>${k.cat.map((c) => `<tr><td>${esc(c.n)}</td><td>${esc(c.price)}</td></tr>`).join('')}</table></div>
      <div class="card2"><b>ANNUAIRE</b><table>${k.phones.map((p) => `<tr><td>${esc(p.n)}</td><td>poste ${esc(p.ext)}</td></tr>`).join('')}</table></div>
    </div>
    <div class="mail" style="margin-top:12px">${winTitle('CROCO MAIL')}
      <div class="mail-bar"><span>Boîte de réception · ${k.mails.length} mails</span><span class="mail-search">Rechercher…</span></div>
      <ul class="mail-list"></ul><div class="mail-read"></div>
    </div>`;
    const ans = k.mails.map(() => -1);
    let open = 0;
    const list = root.querySelector('.mail-list'), read = root.querySelector('.mail-read');
    const draw = () => {
      list.innerHTML = k.mails.map((m, i) => `<li><button type="button" class="mail-row${i === open ? ' sel' : ''}${ans[i] >= 0 ? ' done' : ''}" data-i="${i}">
        <i class="mail-av" style="--c:${avColor(m.from)}">${esc(m.from[0].toUpperCase())}</i><span><b>${esc(m.from)}</b><small>${nb(m.q)}</small></span>
        <em class="mail-tag${ans[i] >= 0 ? '' : ' todo'}">${ans[i] >= 0 ? 'Répondu' : 'Non lu'}</em></button></li>`).join('');
      const m = k.mails[open];
      read.innerHTML = `<div class="hd"><b>${esc(m.from)}</b><span>À : moi · Objet : Petite question</span></div><p class="msg-txt">${nb('« ' + m.q + ' »')}</p>
        <div class="reply"><span>Réponse rapide</span>${m.opts.map((o, j) => `<button type="button" data-o="${j}" aria-pressed="${ans[open] === j}">${esc(o)}</button>`).join('')}</div>`;
    };
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { open = +b.dataset.i; draw(); } });
    read.addEventListener('click', (e) => {
      const b = e.target.closest('[data-o]'); if (!b) return;
      ans[open] = +b.dataset.o;
      sfx.play('switch', { vol: 0.5 });
      const next = ans.findIndex((x) => x < 0);
      if (next >= 0) open = next;
      draw();
    });
    draw();
    return () => ans.slice();
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
    root.innerHTML = deskScene({ wood: true, note: `<span class="t">Règle du jour :</span><span class="c" style="font-size:19px;letter-spacing:0">${esc(k.rule)}</span>`,
      main: `<div class="invs">${k.invoices.map((f, i) => `
      <button type="button" class="inv" data-i="${i}" aria-pressed="false"><b>FACTURE ${esc(f.num)}</b><span>${esc(f.sup)}</span><span>${esc(f.month)}</span>
      <span><b style="font-size:11px">${f.amount} €</b></span><span class="${f.signed ? 'sig' : 'nosig'}">${f.signed ? 'Signée' : 'Pas signée'}</span></button>`).join('')}</div>` });
    wireDesk(root);
    root.querySelector('.invs').addEventListener('click', (e) => {
      const b = e.target.closest('.inv'); if (!b) return;
      const i = +b.dataset.i;
      if (on.has(i)) on.delete(i); else on.add(i);
      b.classList.toggle('on', on.has(i)); b.setAttribute('aria-pressed', String(on.has(i)));
      sfx.play(on.has(i) ? 'chipLay' : 'slide', { vol: 0.6 });
    });
    return () => [...on].sort((a, b) => a - b);
  },

  // Vrai tableur : on tape les réponses dans les cases jaunes, nombres ou formules (=C2+C5, =SOMME(C2:C9), =MAX(C2:C9)).
  // Pour écrire une formule : « = », puis toucher une case (sa référence s'ajoute), « + », une autre case… La barre fx du
  // haut montre et modifie la case active. Marche à la souris comme au doigt (toucher une case ne ferme pas le clavier).
  sheet(k, root) {
    const n0 = k.rows.length + 2; // rangée vide entre les ventes et les questions
    const cols = ['A', 'B', 'C'], data = {};
    k.rows.forEach((r, i) => { data['A' + (i + 2)] = r.city; data['B' + (i + 2)] = r.seller; data['C' + (i + 2)] = r.n; });
    root.innerHTML = `<div class="xl-app">${winTitle('CROCO TABLEUR · ventes.xls')}
      <div class="xl-fx"><span class="xl-ref" id="xlRef">C${n0 + 1}</span><span class="xl-f">fx</span><input id="xlFx" autocomplete="off" spellcheck="false" aria-label="Contenu de la case"></div>
      <div style="overflow-x:auto"><table class="xl"><thead><tr><th class="xl-h"></th>${cols.map((c) => `<th class="xl-h">${c}</th>`).join('')}</tr></thead><tbody>
        <tr><td class="xl-n">1</td><th>Ville</th><th>Vendeur</th><th>Ventes</th></tr>
        ${k.rows.map((r, i) => `<tr><td class="xl-n">${i + 2}</td><td data-ref="A${i + 2}">${esc(r.city)}</td><td data-ref="B${i + 2}">${esc(r.seller)}</td><td class="n" data-ref="C${i + 2}">${r.n}</td></tr>`).join('')}
        <tr><td class="xl-n">${n0}</td><td></td><td></td><td></td></tr>
        ${k.qs.map((q, i) => `<tr><td class="xl-n">${n0 + i + 1}</td><td colspan="2" class="xl-q">${esc(q)}</td><td class="xl-in"><input data-i="${i}" data-ref="C${n0 + i + 1}" autocomplete="off" spellcheck="false" aria-label="${esc(q)}"></td></tr>`).join('')}
      </tbody></table></div>
      <div class="ex-hint">Formules : « = » puis touche les cases, avec + entre elles. Ou =SOMME(C2:C${n0 - 1}), =MAX(C2:C${n0 - 1}).</div></div>`;
    const cells = [...root.querySelectorAll('.xl-in input')], fx = root.querySelector('#xlFx'), refEl = root.querySelector('#xlRef');
    const raw = cells.map(() => ''); // ce que le joueur a tapé (nombre ou formule)
    let act = 0, editor = null; // case jaune active, et le champ en cours d'écriture (la case ou la barre fx)
    // ---- calcul d'une formule (sans eval) : nombres, cases, + - * / ( ), SOMME/SUM, MAX, MIN, MOYENNE sur une plage ----
    const valueOf = (ref, depth) => {
      if (ref in data) return typeof data[ref] === 'number' ? data[ref] : 0;
      const ci = cells.findIndex((c) => c.dataset.ref === ref);
      return ci >= 0 && depth < 5 ? num(raw[ci], depth + 1) : 0;
    };
    const range = (a, b, depth) => {
      const [, ca, ra] = a.match(/([A-Z])(\d+)/), [, cb, rb] = b.match(/([A-Z])(\d+)/), out = [];
      for (let c = Math.min(ca.charCodeAt(0), cb.charCodeAt(0)); c <= Math.max(ca.charCodeAt(0), cb.charCodeAt(0)); c++)
        for (let r = Math.min(+ra, +rb); r <= Math.max(+ra, +rb); r++) { const ref = String.fromCharCode(c) + r; if (typeof data[ref] === 'number' || cells.some((x) => x.dataset.ref === ref)) out.push(valueOf(ref, depth)); }
      return out;
    };
    function evalF(src, depth) {
      const t = src.toUpperCase().replace(/\s+/g, '').replace(/,/g, '.').match(/[A-Z]+\(|[A-Z]\d+:[A-Z]\d+|[A-Z]\d+|\d+(\.\d+)?|[-+*/();]/g) || [];
      let i = 0;
      const peek = () => t[i], next = () => t[i++];
      const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const o = next(), w = term(); v = o === '+' ? v + w : v - w; } return v; };
      const term = () => { let v = fact(); while (peek() === '*' || peek() === '/') { const o = next(), w = fact(); v = o === '*' ? v * w : v / w; } return v; };
      const fact = () => {
        const x = next();
        if (x === '-') return -fact();
        if (x === '(') { const v = expr(); next(); return v; }
        if (/^[A-Z]+\($/.test(x)) {
          const vals = [];
          while (peek() && peek() !== ')') { const a = next(); if (a === ';') continue; if (/:/.test(a)) vals.push(...range(...a.split(':'), depth)); else { i--; vals.push(expr()); } }
          next();
          const f = x.slice(0, -1);
          if (f === 'SOMME' || f === 'SUM') return vals.reduce((a, b) => a + b, 0);
          if (f === 'MAX') return Math.max(...vals);
          if (f === 'MIN') return Math.min(...vals);
          if (f === 'MOYENNE' || f === 'AVERAGE') return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
          return NaN;
        }
        if (/^[A-Z]\d+$/.test(x)) return valueOf(x, depth);
        return Number(x);
      };
      const v = expr();
      return i === t.length ? v : NaN;
    }
    const num = (s, depth = 0) => { s = String(s || '').trim(); if (!s) return 0; return s.startsWith('=') ? evalF(s.slice(1), depth) : Number(s.replace(',', '.')); };
    const shown = (ci) => { const s = raw[ci].trim(); if (!s.startsWith('=')) return s; const v = num(s); return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '#ERREUR'; };
    const paint = () => cells.forEach((c, ci) => { if (c !== document.activeElement) c.value = shown(ci); });
    const select = (ci) => { act = ci; refEl.textContent = cells[ci].dataset.ref; fx.value = raw[ci]; fx.readOnly = false; };
    // on écrit dans la case ou dans la barre fx : les deux restent synchronisées
    root.addEventListener('focusin', (e) => {
      const ci = cells.indexOf(e.target);
      if (ci >= 0) { select(ci); editor = e.target; e.target.value = raw[ci]; }
      else if (e.target === fx) editor = fx;
    });
    root.addEventListener('input', (e) => {
      if (e.target === fx) { raw[act] = fx.value; }
      else { const ci = cells.indexOf(e.target); if (ci < 0) return; raw[ci] = e.target.value; fx.value = raw[ci]; }
      paint();
    });
    root.addEventListener('focusout', () => setTimeout(() => { if (!root.contains(document.activeElement)) editor = null; paint(); }, 0));
    // en pleine formule (« = », « + »…), toucher une case ajoute sa référence sans fermer le clavier
    const picking = () => !!editor && raw[act].startsWith('=') && /[=+\-*/(;:]$/.test(raw[act]);
    let pickedAt = 0; // une case vient d'être ajoutée à la formule : on garde le clavier sur la case qu'on écrit
    const keep = (e) => {
      const td = e.target.closest('td[data-ref], td.xl-in');
      if (!td || e.target === editor) return;
      if (picking() || (td.dataset.ref && Date.now() - pickedAt < 600)) e.preventDefault();
    };
    root.addEventListener('mousedown', keep);
    root.addEventListener('touchstart', keep, { passive: false });
    root.addEventListener('pointerdown', (e) => {
      const td = e.target.closest('td[data-ref], td.xl-in');
      if (!td || e.target === editor) return;
      const ref = td.dataset.ref || td.querySelector('input').dataset.ref;
      if (picking() && ref !== cells[act].dataset.ref) {
        const ed = editor;
        pickedAt = Date.now();
        raw[act] += ref;
        fx.value = raw[act];
        if (ed === cells[act]) ed.value = raw[act];
        td.classList.add('xl-pick'); setTimeout(() => td.classList.remove('xl-pick'), 400);
        sfx.play('key', { vol: 0.6, gap: 0 });
        setTimeout(() => ed.focus(), 0);
      } else if (td.dataset.ref && !picking()) { refEl.textContent = ref; fx.value = String(data[ref] ?? ''); fx.readOnly = true; }
    });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const ci = cells.indexOf(e.target) >= 0 ? cells.indexOf(e.target) : act; if (cells[ci + 1]) cells[ci + 1].focus(); else e.target.blur(); } });
    select(0);
    return () => raw.map((x) => { const v = num(x); return x.trim() ? String(Number.isFinite(v) ? Math.round(v * 100) / 100 : x) : ''; });
  },

  cables(k, root) {
    const link = k.left.map(() => -1);
    let pick = 0;
    root.innerHTML = `<div class="rack"><svg aria-hidden="true"></svg>
      <div class="col">${k.left.map((c, i) => `<button type="button" class="plug" data-l="${i}" style="background:${k.colors[c]}" aria-label="Câble ${c}">${esc(c)}</button>`).join('')}</div>
      <div class="col">${k.right.map((c, i) => `<button type="button" class="port" data-r="${i}" style="background:${k.colors[(k.ink || k.right)[i]]}" aria-label="Prise ${c}"><i></i>${esc(c)}</button>`).join('')}</div></div>`;
    const wrap = root.querySelector('.rack'), svg = wrap.querySelector('svg');
    const draw = () => {
      const W = wrap.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${W.width} ${W.height}`);
      // des fils qui pendent derrière (décor), puis les câbles branchés
      let h = '';
      for (let i = 0; i < 5; i++) { const y = 20 + (i * (W.height - 40)) / 4; h += `<path d="M10 ${y}C${W.width * 0.4} ${y + 60} ${W.width * 0.6} ${y - 50} ${W.width - 10} ${y + 10}" stroke="#2f323a" stroke-width="6" fill="none"/>`; }
      h += link.map((r, l) => {
        if (r < 0) return '';
        const a = wrap.querySelector(`[data-l="${l}"]`).getBoundingClientRect(), b = wrap.querySelector(`[data-r="${r}"]`).getBoundingClientRect();
        const x1 = a.right - W.left - 4, y1 = a.top + a.height / 2 - W.top, x2 = b.left - W.left + 12, y2 = b.top + b.height / 2 - W.top;
        const d = `M${x1} ${y1}C${(x1 + x2) / 2} ${y1 + 30} ${(x1 + x2) / 2} ${y2 + 30} ${x2} ${y2}`;
        return `<path d="${d}" stroke="#000" stroke-opacity=".5" stroke-width="10" fill="none" stroke-linecap="round" transform="translate(0 3)"/><path d="${d}" stroke="${k.colors[k.left[l]]}" stroke-width="7" fill="none" stroke-linecap="round"/>`;
      }).join('');
      svg.innerHTML = h;
      wrap.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('sel', +b.dataset.l === pick));
    };
    wrap.addEventListener('click', (e) => {
      const l = e.target.closest('[data-l]'), r = e.target.closest('[data-r]');
      if (l) pick = +l.dataset.l;
      if (r && pick >= 0) {
        const ri = +r.dataset.r;
        for (let i = 0; i < link.length; i++) if (link[i] === ri) link[i] = -1;
        link[pick] = ri; pick = link.indexOf(-1);
        sfx.play('chipLay', { vol: 0.7 });
      }
      draw();
    });
    addEventListener('resize', draw);
    requestAnimationFrame(draw);
    return () => link;
  },

  code(k, root) {
    const TITLE = { 'licence Windows': 'Activation de Windows', 'code Wi-Fi des invités': 'Wi-Fi · réseau Invités', 'numéro de commande': 'Suivi de commande', 'code de la photocopieuse': 'Photocopieuse · codes d’accès' };
    root.innerHTML = deskScene({
      note: `<span class="t">${esc(k.what || 'Codes')} :</span>${k.codes.map((c) => `<span class="c">${esc(c)}</span>`).join('')}`,
      main: `<div class="desk-win">${winTitle(esc((TITLE[k.what] || 'Saisie des codes').toUpperCase()))}
        <div class="in">${k.codes.map((_, i) => `<label>Code ${i + 1}<input data-i="${i}" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>`).join('')}</div></div>`,
    });
    wireDesk(root);
    return () => [...root.querySelectorAll('.desk-win input')].map((x) => x.value);
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
    root.innerHTML = deskScene({ notif: esc(k.brief), main: `<div class="desk-win">${winTitle('GESTIONNAIRE DE FICHIERS')}
      <div class="fm-bar"><span class="fm-path">Ce PC › Analyse en cours</span><span id="fmCount">0 sélectionné</span></div>
      <ul class="fm-list">${k.files.map((f, i) => `<li><button type="button" class="fm-row" data-i="${i}" aria-pressed="false">${FILE_ICO.file(f.n)}
        <span><b>${esc(f.n)}</b>${q ? `<small>${f.size} Mo · ${esc(f.from)}</small>` : ''}</span><em>${q ? 'OK' : 'Sain'}</em></button></li>`).join('')}</ul>
      <div class="ex-hint">Touche un fichier pour le ${q ? 'mettre en quarantaine' : 'marquer comme virus'} (touche encore pour annuler).</div></div>` });
    root.querySelector('.fm-list').addEventListener('click', (e) => {
      const b = e.target.closest('.fm-row'); if (!b) return;
      const i = +b.dataset.i;
      if (on.has(i)) on.delete(i); else on.add(i);
      b.classList.toggle('on', on.has(i)); b.setAttribute('aria-pressed', String(on.has(i)));
      b.querySelector('em').textContent = on.has(i) ? (q ? 'Quarantaine' : 'Virus') : (q ? 'OK' : 'Sain');
      root.querySelector('#fmCount').textContent = `${on.size} sélectionné${on.size > 1 ? 's' : ''}`;
      sfx.play('switch', { vol: 0.5 });
    });
    return () => [...on].sort((a, b) => a - b);
  },

  phone(k, root) {
    const to = k.calls.map(() => '');
    let cur = 0;
    root.innerHTML = `<div class="taped"><b>Fiche du standard</b><table>${Object.entries(k.guide).map(([sv, ks]) => `<tr><td>${esc(sv)}</td><td>${ks.map(esc).join(', ')}</td></tr>`).join('')}</table></div>
      <div class="pbx"><div class="pbx-head"><span>STANDARD</span><span id="pbxLeft"></span></div><ul class="call-list"></ul><div class="call-detail"></div></div>`;
    const list = root.querySelector('.call-list'), det = root.querySelector('.call-detail');
    const draw = () => {
      const left = to.filter((x) => !x).length;
      root.querySelector('#pbxLeft').textContent = left ? `${left} EN ATTENTE` : 'TOUT TRANSFÉRÉ';
      list.innerHTML = k.calls.map((c, i) => `<li><button type="button" class="call${i === cur ? ' sel' : ''}${to[i] ? ' done' : ''}" data-i="${i}"><span class="led"></span>
        <span><b>Ligne ${i + 1} · ${esc(c.who)}</b><small>${nb('« ' + c.text + ' »')}</small></span><em>${to[i] ? '→ ' + esc(to[i]) : 'En attente'}</em></button></li>`).join('');
      const c = k.calls[cur];
      det.innerHTML = `<p><b>${esc(c.who)}</b>${nb(' : « ' + c.text + ' »')}</p>
        <div class="tr"><span>Transférer à</span>${k.services.map((sv) => `<button type="button" data-s="${esc(sv)}" aria-pressed="${to[cur] === sv}">${esc(sv)}</button>`).join('')}</div>`;
    };
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { cur = +b.dataset.i; draw(); } });
    det.addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      to[cur] = b.dataset.s;
      sfx.play('switch', { vol: 0.6 });
      const next = to.findIndex((x) => !x);
      if (next >= 0) cur = next;
      draw();
    });
    draw();
    return () => to.slice();
  },

  printer(k, root) {
    const typed = [];
    let replays = 1, showing = false;
    root.innerHTML = `<div class="copier"><div class="cp-lid"></div><div class="cp-body">
      <div class="cp-brand"><span>CROCO COPY 3000</span><span>BOURRAGE</span></div>
      <div class="cp-panel"><div class="cp-lcd" id="pscreen">APPUIE SUR « VOIR LA COMBINAISON »</div>
        <div class="cp-keys keys">${k.keys.map((n, i) => `<button type="button" data-k="${i}">${esc(n)}</button>`).join('')}</div>
        <div class="cp-ctrl"><button type="button" class="go" id="pshow">Voir la combinaison</button><button type="button" class="clr" id="pclear">Effacer</button></div></div>
      </div><div class="cp-tray"></div></div>`;
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
      sfx.play('key', { vol: 0.8, gap: 0 });
      b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), 160);
      screen();
    });
    return () => typed.slice();
  },
};

// ---------- mode essai : travail.html?essai=mailsort (ou files, code…) ----------
// Une tâche d'entraînement, vérifiée sur place : rien n'est envoyé au serveur, rien n'est payé.
const essai = new URLSearchParams(location.search).get('essai');
if (essai && TASKS[essai]) {
  const seed = Math.floor(Math.random() * 1e9), k = makeTask(essai, seed), box = $('task');
  box.hidden = false;
  box.innerHTML = `<h2>Essai · ${esc(k.title)}</h2><p class="brief">${esc(k.brief)}</p><div id="tbody"></div>
    <p class="tmsg" id="tmsg"></p><div class="check-row"><button class="btn-main" id="tgo" type="button">Vérifier</button></div>`;
  const get = R[essai](k, $('tbody'));
  $('tgo').addEventListener('click', () => {
    const ok = checkTask(essai, seed, get());
    $('tmsg').textContent = ok ? 'Bravo, c’est juste ! (mode essai : rien n’est payé)' : 'Pas encore : vérifie et réessaie.';
    if (ok) sfx.gain(true, 0.8); else sfx.play('lose', { vol: 0.8 });
  });
}
