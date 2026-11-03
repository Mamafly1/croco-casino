// Copie sur le site les images Steam des caisses et de leurs objets (img/steam/<nom>.webp, 256×192),
// pour qu'elles s'affichent même sur les réseaux qui bloquent les serveurs d'images de Steam.
// Lancé par GitHub Actions (workflow « Images des caisses »). Usage : node tools/fetch-images.mjs
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { localImageName } from '../js/imgname.js';

const BASES = (process.env.IMG_BASES || 'https://community.akamai.steamstatic.com,https://community.cloudflare.steamstatic.com').split(',');
const OUT = new URL('../img/steam/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const data = JSON.parse(readFileSync(new URL('../data/cases.json', import.meta.url)));
const all = new Set();
for (const c of data.cases) { all.add(c.i); for (const it of [...c.items, ...c.rare]) all.add(it.i); }
const todo = [...all].filter((i) => i && !existsSync(new URL(localImageName(i) + '.webp', OUT))).slice(0, +process.env.IMG_LIMIT || Infinity);
console.log(`${all.size} images, ${todo.length} à télécharger`);

let done = 0, failed = 0;
async function one(i) {
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}/economy/image/${i}/256fx192f`);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const webp = await sharp(buf).resize(256, 192, { fit: 'inside' }).webp({ quality: 78 }).toBuffer();
      writeFileSync(new URL(localImageName(i) + '.webp', OUT), webp);
      done++;
      return;
    } catch { /* serveur suivant */ }
  }
  failed++;
  console.log('échec', i.slice(0, 40));
}
const queue = [...todo];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await one(queue.shift()); }));
console.log(`${done} téléchargées, ${failed} en échec`);
