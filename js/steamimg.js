// Images Steam des caisses et objets, partagées par toutes les pages.
import { localImageName } from './imgname.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Images Steam : d'abord la copie hébergée sur le site (img/steam/, faite par le workflow « Images des caisses »),
// qui passe partout. Si elle manque, les serveurs de Steam, l'un après l'autre (certains réseaux en bloquent),
// et toute la page suit le serveur qui marche.
const HOSTS = ['https://community.akamai.steamstatic.com', 'https://community.cloudflare.steamstatic.com', 'https://community.fastly.steamstatic.com'];
let hostIdx = 0;
try { hostIdx = Math.min(HOSTS.length - 1, +sessionStorage.getItem('croco-img-host') || 0); } catch {}
const imgUrl = (i, size, h = hostIdx) => (h < 0 ? `img/steam/${localImageName(i)}.webp` : `${HOSTS[h]}/economy/image/${i}${size ? '/' + size : ''}`);
export const img = (i, size = '256fx256f') => (i ? imgUrl(i, size, -1) : '');
export const imgTag = (i, alt, size = '256fx256f') => `<img src="${img(i, size)}" data-i="${i}" data-size="${size}" data-h="-1" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`;
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName !== 'IMG' || !t.dataset.i) return;
  const h = +t.dataset.h;
  if (h < 0) { t.dataset.h = hostIdx; t.src = imgUrl(t.dataset.i, t.dataset.size); return; } // pas encore copiée sur le site
  if (h === hostIdx && hostIdx < HOSTS.length - 1) {
    hostIdx++; // ce serveur ne passe pas ici : on change pour toute la page
    try { sessionStorage.setItem('croco-img-host', hostIdx); } catch {}
  }
  if (h < hostIdx) { t.dataset.h = hostIdx; t.src = imgUrl(t.dataset.i, t.dataset.size); return; }
  if (t.dataset.size) { t.dataset.size = ''; t.src = imgUrl(t.dataset.i, ''); return; } // dernier essai : image brute
  t.style.visibility = 'hidden';
}, true);
