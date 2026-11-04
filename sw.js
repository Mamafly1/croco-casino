// Service worker de Croco Casino : rend le site installable comme une appli.
// Toujours le réseau d'abord (on a donc toujours la dernière version du site) ; la copie gardée ne sert que hors connexion.
const CACHE = 'croco-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  // seulement les fichiers du site lui-même (pas le serveur de jeu, ni SkinHub, Klipy ou Steam)
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' }); // demande au serveur si le fichier a changé
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw new Error('hors ligne');
    }
  })());
});
