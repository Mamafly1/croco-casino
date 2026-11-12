// Travail du jour : 3 petites tâches de bureau, tirées au hasard parmi les types ci-dessous.
// Chaque tâche est fabriquée à partir d'une graine : le navigateur l'affiche, le serveur la refait pour vérifier la réponse.
// Tout se vérifie par des règles (aucune IA) : `sol` est la bonne réponse, `same(sol, ans)` la compare.

export const PAY_MIN = 90, PAY_MAX = 120; // € gagnés au total sur les 3 tâches

// Hasard à graine (le même sur le serveur et le navigateur)
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const euro = (x) => x.toFixed(2).replace('.', ',') + ' €';
const NAMES = ['Gérard', 'Sandrine', 'Kevin', 'Brenda', 'Jean-Mi', 'Josiane', 'Patrick', 'Nadia', 'Bruno', 'Cindy', 'Didier', 'Yasmine'];

// ---------- 1. Dossiers : le PC de quelqu'un ----------
const OWNERS = ['Gérard', 'Mamie Josiane', 'Kevin du marketing', 'ton patron', 'Sandrine de la compta', 'Tonton Michel', 'Brenda', 'Jean-Mi'];
const FOLDERS = ['Documents', 'Photos', 'Travail', 'Téléchargements', 'Musique', 'Factures', 'Vacances 2019', 'Projets', 'Divers'];
const FILES = ['facture_mars.pdf', 'photo_chat.jpg', 'cv_final_v3.docx', 'cv_final_v4_VRAI.docx', 'budget.xlsx', 'memes.zip',
  'IMG_2034.jpg', 'rapport.docx', 'playlist.mp3', 'tmp_8812.tmp', '~copie.tmp', 'motdepasse.txt', 'recette_crepes.txt',
  'video_mariage.mp4', 'devis_cuisine.pdf', 'selfie_flou.jpg', 'presentation.pptx', 'notes_reunion.txt', 'cache_old.tmp'];
const NEW_BASE = ['NE_PAS_OUVRIR', 'important', 'vieux_truc', 'a_trier', 'final_final', 'secret', 'perso', 'archive_2020'];
const NEW_FOLDERS = ['Boulot', 'Perso', 'À trier', 'Archives', 'Secret', 'Impôts', 'Memes', 'Recettes'];
const ext = (f) => f.slice(f.lastIndexOf('.'));
const base = (p) => p.replace(/\/$/, '').split('/').pop();
const parent = (p) => { const s = p.replace(/\/$/, ''); const i = s.lastIndexOf('/'); return i < 0 ? '' : s.slice(0, i + 1); };

const files = {
  title: 'Range le PC',
  gen(r) {
    const owner = pick(r, OWNERS);
    const folders = shuffle(r, FOLDERS).slice(0, int(r, 3, 4));
    const fl = shuffle(r, FILES).slice(0, int(r, 6, 8));
    const tree = folders.map((f) => f + '/');
    // au moins deux fichiers .tmp seront supprimables si la consigne tombe
    for (const f of fl) tree.push((r() < 0.45 ? pick(r, folders) + '/' : '') + f);
    const st = tree.slice(), steps = [], used = new Set();
    const filesNow = () => st.filter((p) => !p.endsWith('/') && !used.has(p));
    const kinds = shuffle(r, ['move', 'rename', 'create', 'createMove', 'delete', 'deleteTmp', 'move', 'rename']);
    for (const k of kinds) {
      const fs = filesNow();
      if (!fs.length || steps.length === 3) break;
      if (k === 'move') {
        const f = pick(r, fs), to = pick(r, folders.filter((d) => parent(f) !== d + '/'));
        if (!to) continue;
        st[st.indexOf(f)] = to + '/' + base(f); used.add(to + '/' + base(f));
        steps.push(`Range « ${base(f)} » dans le dossier « ${to} ».`);
      } else if (k === 'rename') {
        const f = pick(r, fs), nn = pick(r, NEW_BASE) + ext(f);
        if (st.some((p) => base(p) === nn)) continue;
        st[st.indexOf(f)] = parent(f) + nn; used.add(parent(f) + nn);
        steps.push(`Renomme « ${base(f)} » en « ${nn} ».`);
      } else if (k === 'create') {
        const n = pick(r, NEW_FOLDERS.filter((x) => !st.some((p) => base(p) === x)));
        const inside = r() < 0.4 ? pick(r, folders) : '';
        st.push((inside ? inside + '/' : '') + n + '/');
        steps.push(inside ? `Crée un dossier « ${n} » dans « ${inside} ».` : `Crée un dossier « ${n} » sur le bureau (à la racine).`);
      } else if (k === 'createMove') {
        const n = pick(r, NEW_FOLDERS.filter((x) => !st.some((p) => base(p) === x)));
        const f = pick(r, fs);
        st.push(n + '/');
        st[st.indexOf(f)] = n + '/' + base(f); used.add(n + '/' + base(f));
        steps.push(`Crée un dossier « ${n} » à la racine et mets-y « ${base(f)} ».`);
      } else if (k === 'delete') {
        const f = pick(r, fs);
        st.splice(st.indexOf(f), 1);
        steps.push(`Supprime « ${base(f)} ».`);
      } else if (k === 'deleteTmp') {
        const tmps = st.filter((p) => p.endsWith('.tmp'));
        if (!tmps.length) continue;
        for (const t of tmps) st.splice(st.indexOf(t), 1);
        steps.push('Supprime tous les fichiers .tmp (il y en a peut-être dans les dossiers).');
      }
    }
    return { brief: `Tu es sur le PC de ${owner}. Fais exactement ce que dit la note.`, owner, tree, steps, sol: st.slice().sort() };
  },
  // réponse : la liste des chemins à la fin (dossiers terminés par « / »)
  same(sol, ans) { return Array.isArray(ans) && eq(sol.map(norm).sort(), ans.map(norm).sort()); },
};

// ---------- 2. Tri des mails ----------
const BOXES = ['Important', 'Spam', 'Compta', 'Archive', 'Clients'];
const MAIL_KINDS = {
  patron: { label: 'le patron', mails: [['Le Patron', 'Réunion demain 8h, soyez à l’heure'], ['Le Patron', 'Qui a mangé mon yaourt ?'], ['Direction', 'Nouvelle règle : pas de chaussettes dans les réunions'], ['Le Patron', 'Point sur les objectifs du trimestre']] },
  pub: { label: 'les pubs', mails: [['Croco Shop', '-70 % sur les tongs en croco !!!'], ['Promo Express', 'Vous avez gagné un iPhone 47'], ['MegaDeals', 'Dernière chance : grille-pain connecté'], ['Super Offre', 'Votre colis attend (cliquez vite)']] },
  facture: { label: 'les factures', mails: [['Fournisseur Papier', 'Facture n°4512'], ['EDF Bureau', 'Votre facture d’électricité'], ['Machine à Café SA', 'Facture capsules – juin'], ['Imprim’Plus', 'Facture toner']] },
  collegue: { label: 'les collègues', mails: [['Kevin', 'Regarde ce meme mdr'], ['Brenda', 'Pot de départ vendredi ?'], ['Jean-Mi', 'Tu as vu mon agrafeuse ?'], ['Cindy', 'Photos du séminaire']] },
  client: { label: 'les clients', mails: [['Client Dupont', 'Question sur ma commande'], ['Société Lambda', 'Demande de devis'], ['Mme Martin', 'Retard de livraison'], ['Client Durand', 'Merci pour votre aide']] },
};
const mailsort = {
  title: 'Trie la boîte mail',
  gen(r) {
    const kinds = Object.keys(MAIL_KINDS);
    // règle de base, puis une ou deux règles changées aujourd'hui
    const rule = { patron: 'Important', pub: 'Spam', facture: 'Compta', collegue: 'Archive', client: 'Clients' };
    const twist = shuffle(r, kinds).slice(0, int(r, 1, 2));
    for (const k of twist) rule[k] = pick(r, BOXES.filter((b) => b !== rule[k]));
    const exc = pick(r, MAIL_KINDS.collegue.mails)[0];
    const excBox = pick(r, ['Spam', 'Important']);
    const mails = [];
    for (const k of shuffle(r, [...kinds, ...shuffle(r, kinds).slice(0, int(r, 1, 2))])) {
      const [from, subject] = pick(r, MAIL_KINDS[k].mails);
      mails.push({ from, subject, box: k === 'collegue' && from === exc ? excBox : rule[k] });
    }
    if (!mails.some((m) => m.from === exc)) mails.push({ from: exc, subject: 'Tu passes à mon bureau ?', box: excBox });
    const note = kinds.map((k) => `${MAIL_KINDS[k].label[0].toUpperCase() + MAIL_KINDS[k].label.slice(1)} → ${rule[k]}`);
    note.push(`Exception : tout ce qui vient de ${exc} → ${excBox}`);
    return { brief: 'Range chaque mail dans le bon dossier, en suivant le post-it.', boxes: BOXES, note, mails: mails.map(({ from, subject }) => ({ from, subject })), sol: mails.map((m) => m.box) };
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans); },
};

// ---------- 3. Répondre aux mails ----------
const ROOMS = ['Salle Croco', 'Salle Cactus', 'Aquarium', 'Salle 204', 'Open space', 'Cafétéria'];
const PRODUCTS = ['Agrafeuse turbo', 'Chaise qui grince', 'Pack de 500 post-it', 'Écran 27 pouces', 'Clavier sans touche E', 'Plante en plastique', 'Tasse « Meilleur employé »'];
const mailreply = {
  title: 'Réponds aux mails',
  gen(r) {
    // l'agenda et le catalogue sont la référence ; chaque mail pose une question dont la réponse y est
    const meetings = shuffle(r, ['Réunion budget', 'Point projet', 'Pot de Brenda', 'Formation Excel', 'Visite du client', 'Séminaire motivation']).slice(0, 4)
      .map((t) => ({ t, h: `${int(r, 8, 17)}h${pick(r, ['00', '15', '30', '45'])}`, room: pick(r, ROOMS) }));
    const cat = shuffle(r, PRODUCTS).slice(0, 4).map((n) => ({ n, price: int(r, 3, 400) + pick(r, [0, 0.5, 0.99]) }));
    const phones = shuffle(r, NAMES).slice(0, 4).map((n) => ({ n, ext: String(int(r, 100, 999)) }));
    const qs = [];
    const asks = shuffle(r, ['time', 'room', 'price', 'phone', 'time', 'price']).slice(0, 3);
    for (const a of asks) {
      let q, good, bad;
      if (a === 'time' || a === 'room') {
        const m = pick(r, meetings);
        if (a === 'time') { q = `C’est à quelle heure, « ${m.t} » ?`; good = m.h; bad = shuffle(r, meetings.filter((x) => x.h !== m.h).map((x) => x.h).concat([`${int(r, 8, 17)}h10`, `${int(r, 8, 17)}h50`])); }
        else { q = `« ${m.t} », c’est dans quelle salle ?`; good = m.room; bad = shuffle(r, ROOMS.filter((x) => x !== m.room)); }
      } else if (a === 'price') {
        const c = pick(r, cat);
        q = `Combien coûte « ${c.n} » ?`; good = euro(c.price);
        bad = shuffle(r, [euro(c.price * 2), euro(Math.max(1, c.price - 10)), euro(c.price + 1), euro(Math.round(c.price))].filter((x) => x !== good));
      } else {
        const ph = pick(r, phones);
        q = `C’est quoi le poste de ${ph.n} ?`; good = ph.ext;
        bad = shuffle(r, phones.filter((x) => x.ext !== ph.ext).map((x) => x.ext).concat([String(int(r, 100, 999))]));
      }
      const wrong = [...new Set(bad)].filter((x) => x !== good).slice(0, 2);
      const opts = shuffle(r, [good, ...wrong]);
      qs.push({ from: pick(r, NAMES), q, opts: opts.map((o) => `Bonjour, c’est ${o}. Bonne journée !`), ok: opts.indexOf(good) });
    }
    return { brief: 'Réponds à chaque mail avec la bonne info : regarde l’agenda, le catalogue et l’annuaire.', meetings, cat: cat.map((c) => ({ n: c.n, price: euro(c.price) })), phones,
      mails: qs.map(({ from, q, opts }) => ({ from, q, opts })), sol: qs.map((x) => x.ok) };
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map(Number)); },
};

// ---------- 4. Caisse : rendre la monnaie ----------
const change = {
  title: 'Tiens la caisse',
  gen(r) {
    const items = ['un café', 'un croissant', 'un sandwich', 'des chewing-gums', 'un journal', 'une salade', 'un jus', 'un ticket de loto', 'des piles'];
    const clients = [];
    for (let i = 0; i < 3; i++) {
      const price = Math.round((int(r, 60, 4500) / 100) * 20) / 20; // multiple de 5 centimes
      const paid = [5, 10, 20, 50].find((n) => n > price + 0.04) || 100;
      clients.push({ who: pick(r, NAMES), what: pick(r, items), price, paid });
    }
    return { brief: 'Rends la monnaie exacte à chaque client avec les pièces et billets.', coins: [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05], clients, sol: clients.map((c) => Math.round((c.paid - c.price) * 100)) };
  },
  // réponse : la somme rendue en centimes, par client
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map((x) => Math.round(Number(x)))); },
};

// ---------- 5. Tamponner les factures ----------
const SUPPLIERS = ['Papier & Co', 'Café Express', 'Imprim’Plus', 'Croco Meubles', 'Clean Bureau', 'Tech Discount'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const stamp = {
  title: 'Valide les factures',
  gen(r) {
    for (;;) {
      const inv = [];
      for (let i = 0; i < 8; i++) inv.push({ num: 'F-' + int(r, 1000, 9999), sup: pick(r, SUPPLIERS), amount: int(r, 20, 990), signed: r() < 0.7, month: int(r, 0, 11) });
      const v = int(r, 0, 2);
      let rule, ok;
      if (v === 0) {
        const max = pick(r, [200, 300, 500]);
        rule = `Tamponne VALIDÉ les factures signées de moins de ${max} €.`; ok = (f) => f.signed && f.amount < max;
      } else if (v === 1) {
        const [a, b] = shuffle(r, [...new Set(inv.map((f) => f.sup))]);
        rule = `Tamponne VALIDÉ les factures de « ${a} » et de « ${b || a} », seulement si elles sont signées.`; ok = (f) => (f.sup === a || f.sup === b) && f.signed;
      } else {
        const m = pick(r, inv).month, min = pick(r, [50, 100, 150]);
        rule = `Tamponne VALIDÉ les factures de ${MONTHS[m]} de plus de ${min} € (signées ou non).`; ok = (f) => f.month === m && f.amount > min;
      }
      const sol = inv.map((f, i) => (ok(f) ? i : -1)).filter((i) => i >= 0);
      if (sol.length >= 2 && sol.length <= 6) {
        return { brief: 'Lis la règle du jour et tamponne les bonnes factures.', rule, invoices: inv.map((f) => ({ ...f, month: MONTHS[f.month] })), sol };
      }
    }
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map(Number).sort((a, b) => a - b)); },
};

// ---------- 6. Tableur ----------
const CITIES = ['Lyon', 'Paris', 'Marseille', 'Lille', 'Nantes', 'Brest'];
const sheet = {
  title: 'Remplis le tableur',
  gen(r) {
    const cities = shuffle(r, CITIES).slice(0, 3);
    const rows = [];
    for (let i = 0; i < int(r, 6, 8); i++) rows.push({ city: pick(r, cities), seller: pick(r, NAMES), n: int(r, 3, 60) });
    const qs = [];
    const c1 = pick(r, cities);
    qs.push({ q: `Total des ventes de ${c1}`, a: rows.filter((x) => x.city === c1).reduce((s, x) => s + x.n, 0) });
    const v = int(r, 0, 2);
    if (v === 0) qs.push({ q: 'Total de toutes les ventes', a: rows.reduce((s, x) => s + x.n, 0) });
    else if (v === 1) qs.push({ q: 'Plus grosse vente (le nombre)', a: Math.max(...rows.map((x) => x.n)) });
    else { const c2 = pick(r, cities.filter((c) => c !== c1)); qs.push({ q: `Total des ventes de ${c2}`, a: rows.filter((x) => x.city === c2).reduce((s, x) => s + x.n, 0) }); }
    return { brief: 'Le chef veut les totaux. Calcule et remplis les cases jaunes.', rows, qs: qs.map((x) => x.q), sol: qs.map((x) => x.a) };
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map((x) => Number(String(x).replace(',', '.')))); },
};

// ---------- 7. Câbles ----------
const CABLE_COLORS = [['rouge', '#de0607'], ['jaune', '#ffbf17'], ['bleu', '#4b69ff'], ['vert', '#3ddc5f'], ['rose', '#ff6fd8'], ['blanc', '#f0f0e6']];
const cables = {
  title: 'Rebranche les câbles',
  gen(r) {
    const n = int(r, 4, 6);
    const cols = shuffle(r, CABLE_COLORS).slice(0, n);
    const left = cols.map((c) => c[0]);
    const right = shuffle(r, left);
    const label = r() < 0.5; // variante : les prises de droite n'ont que le nom de la couleur
    return { brief: label ? 'Relie chaque câble à la prise qui porte le nom de sa couleur.' : 'Relie chaque câble à la prise de la même couleur.', colors: Object.fromEntries(cols), left, right, label, sol: left.map((c) => right.indexOf(c)) };
  },
  // réponse : pour chaque câble de gauche, l'indice de la prise de droite
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map(Number)); },
};

// ---------- 8. Recopier des codes ----------
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = {
  title: 'Recopie les codes',
  gen(r) {
    const fmt = pick(r, [[4, 4], [3, 3, 3], [5, 5], [2, 4, 2]]);
    const what = pick(r, ['licence Windows', 'code Wi-Fi des invités', 'numéro de commande', 'code de la photocopieuse']);
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push(fmt.map((k) => Array.from({ length: k }, () => pick(r, CODE_CH.split(''))).join('')).join('-'));
    return { brief: `Recopie les 3 codes (${what}) sans faute.`, what, codes, sol: codes };
  },
  same(sol, ans) {
    const c = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return Array.isArray(ans) && sol.every((s, i) => c(s) === c(ans[i]));
  },
};

// ---------- 9. Entrepôt : compter ----------
const STOCK = { carton: 'cartons', bidon: 'bidons', palette: 'palettes', extincteur: 'extincteurs' };
const count = {
  title: 'Fais l’inventaire',
  gen(r) {
    const types = Object.keys(STOCK);
    const tags = ['vert', 'rouge'];
    const items = [];
    for (let i = 0; i < int(r, 24, 36); i++) items.push({ k: pick(r, types), tag: r() < 0.35 ? pick(r, tags) : null });
    const t1 = pick(r, types), t2 = pick(r, types.filter((t) => t !== t1)), tag = pick(r, tags);
    const v = r() < 0.5;
    const qs = [
      { q: `Combien de ${STOCK[t1]} ?`, a: items.filter((x) => x.k === t1).length },
      v ? { q: `Combien de ${STOCK[t2]} avec une étiquette ${tag} ?`, a: items.filter((x) => x.k === t2 && x.tag === tag).length }
        : { q: `Combien d’objets avec une étiquette ${tag} (tous types) ?`, a: items.filter((x) => x.tag === tag).length },
    ];
    return { brief: 'Compte le stock de l’entrepôt.', items, qs: qs.map((x) => x.q), sol: qs.map((x) => x.a) };
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map(Number)); },
};

// ---------- 10. Antivirus ----------
const SAFE = ['photo_vacances.jpg', 'rapport_final.docx', 'budget_2024.xlsx', 'musique.mp3', 'setup_imprimante.exe', 'contrat.pdf', 'notes.txt', 'video_chat.mp4', 'logo.png', 'presentation.pptx', 'installer_zoom.exe', 'archive.zip'];
const BAD = ['photo_vacances.jpg.exe', 'facture.pdf.scr', 'CV_urgent.docx.exe', 'iPhone_gratuit.exe', 'cadeau.zip.bat', 'mot_de_passe.txt.scr', 'video_drole.mp4.exe', 'virement.pdf.bat'];
const antivirus = {
  title: 'Passe l’antivirus',
  gen(r) {
    const v = r() < 0.5;
    if (v) {
      const bad = shuffle(r, BAD.filter((b) => b !== 'iPhone_gratuit.exe')).slice(0, int(r, 2, 4));
      const all = shuffle(r, [...shuffle(r, SAFE).slice(0, 12 - bad.length), ...bad]);
      return { brief: 'Supprime les virus : les fichiers qui se font passer pour autre chose (double extension, finissent par .exe, .scr ou .bat). Les vrais programmes .exe restent.', files: all.map((n) => ({ n })), sol: all.map((n, i) => (bad.includes(n) ? i : -1)).filter((i) => i >= 0) };
    }
    // variante : quarantaine selon la taille et la provenance
    const max = pick(r, [500, 800]);
    const files = shuffle(r, SAFE).slice(0, 10).map((n) => ({ n, size: int(r, 5, 1500), from: pick(r, ['Téléchargements', 'Clé USB', 'Mail', 'Bureau']) }));
    const src = pick(r, ['Téléchargements', 'Clé USB', 'Mail']);
    if (!files.some((f) => f.from === src && f.size > max)) Object.assign(files[0], { from: src, size: max + int(r, 10, 600) });
    return { brief: `Mets en quarantaine les fichiers venant de « ${src} » qui font plus de ${max} Mo.`, files, sol: files.map((f, i) => (f.from === src && f.size > max ? i : -1)).filter((i) => i >= 0) };
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map(Number).sort((a, b) => a - b)); },
};

// ---------- 11. Standard téléphonique ----------
const SERVICES = {
  Compta: ['facture', 'remboursement', 'paiement', 'virement'],
  RH: ['congés', 'salaire', 'contrat', 'arrêt maladie'],
  Technique: ['panne', 'mot de passe', 'ordinateur', 'imprimante'],
  Commercial: ['devis', 'commande', 'tarif', 'promotion'],
  Direction: ['partenariat', 'journaliste', 'plainte', 'rachat'],
};
const CALL_TPL = ['Allô, c’est pour {k}.', 'Bonjour, j’ai un souci de {k}.', 'Oui bonjour, je voudrais parler de {k}.', 'Je rappelle pour mon histoire de {k}.', 'C’est urgent, c’est au sujet de {k} !'];
const phone = {
  title: 'Tiens le standard',
  gen(r) {
    // aujourd'hui, deux mots-clés par service (tirés au hasard) sont sur la fiche
    const guide = Object.fromEntries(Object.entries(SERVICES).map(([s, ks]) => [s, shuffle(r, ks).slice(0, 2)]));
    const calls = [];
    for (let i = 0; i < 6; i++) {
      const s = pick(r, Object.keys(guide)), k = pick(r, guide[s]);
      calls.push({ who: pick(r, NAMES), text: pick(r, CALL_TPL).replace('{k}', k), s });
    }
    return { brief: 'Transfère chaque appel au bon service, grâce à la fiche des mots-clés.', guide, services: Object.keys(SERVICES), calls: calls.map(({ who, text }) => ({ who, text })), sol: calls.map((c) => c.s) };
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans); },
};

// ---------- 12. Photocopieuse : retenir une séquence ----------
const PRINTER_KEYS = ['Recto', 'Verso', 'Zoom', 'A4', 'A3', 'Couleur'];
const printer = {
  title: 'Débloque la photocopieuse',
  gen(r) {
    const n = int(r, 4, 6), len = int(r, 5, 7);
    const keys = PRINTER_KEYS.slice(0, n);
    const seq = Array.from({ length: len }, () => int(r, 0, n - 1));
    return { brief: 'Le technicien te montre la combinaison une fois. Retiens-la et tape-la.', keys, seq, sol: seq };
  },
  same(sol, ans) { return Array.isArray(ans) && eq(sol, ans.map(Number)); },
};

export const TASKS = { files, mailsort, mailreply, change, stamp, sheet, cables, code, count, antivirus, phone, printer };
export const TASK_TYPES = Object.keys(TASKS);

export function makeTask(type, seed) {
  const t = TASKS[type];
  return t ? { type, title: t.title, ...t.gen(seeded(seed)) } : null;
}
export function checkTask(type, seed, ans) {
  const t = TASKS[type];
  if (!t) return false;
  try { return !!t.same(t.gen(seeded(seed)).sol, ans); } catch { return false; }
}

// Jour en heure française (les tâches changent à minuit à Paris)
export function workDay(now = Date.now()) {
  return new Date(now).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

// Les 3 tâches du jour et leur paie (90 à 120 € au total, en parts inégales)
export function newDay(rng, day) {
  const types = TASK_TYPES.slice();
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  const total = PAY_MIN + Math.floor(rng() * (PAY_MAX - PAY_MIN + 1));
  const w = [0, 1, 2].map(() => 0.6 + rng() * 0.8), sw = w.reduce((a, b) => a + b, 0);
  const pays = w.map((x) => Math.round((x / sw) * total));
  pays[2] = total - pays[0] - pays[1];
  return { day, tasks: types.slice(0, 3).map((type, i) => ({ type, seed: Math.floor(rng() * 2 ** 31), pay: pays[i], done: false })) };
}
