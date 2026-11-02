# Serveur multijoueur de Croco Casino

Le site reste sur GitHub Pages. Ce dossier contient le petit serveur qui permet de jouer ensemble :
solde commun à tous les jeux, classement partagé, fil des parties en direct, roulette en tours partagés
et table de blackjack visible par tous.

Il tourne sur **Cloudflare Workers** avec un **Durable Object** (base SQLite intégrée). Les tirages
(roulette, cartes, caisses…) sont faits sur le serveur avec les mêmes règles que le mode solo
(`js/engine/`), pour que personne ne puisse tricher au classement en modifiant la page.

Tant que `js/config.js` est vide, le site fonctionne en **mode solo** : rien ne casse.

## Mettre le serveur en ligne (une seule fois)

1. Crée un compte gratuit sur <https://dash.cloudflare.com/sign-up>. Les Durable Objects avec stockage
   SQLite sont disponibles sur l’offre gratuite ; vérifie les limites du moment sur
   <https://developers.cloudflare.com/durable-objects/platform/pricing/>.
2. Installe Node.js (version LTS) : sous Windows, `winget install OpenJS.NodeJS.LTS`, puis rouvre le terminal.
3. Dans le dossier du dépôt :

   ```bash
   cd server
   npx wrangler login      # ouvre le navigateur pour te connecter à Cloudflare
   npx wrangler deploy     # envoie le serveur
   ```

   À la fin, wrangler affiche une adresse du type `https://croco-casino.TON-NOM.workers.dev`.
4. Vérifie qu’il répond : ouvre `https://croco-casino.TON-NOM.workers.dev/health`, tu dois voir `ok`.
5. Mets cette adresse dans `js/config.js` :

   ```js
   export const SERVER_URL = 'https://croco-casino.TON-NOM.workers.dev';
   ```

   puis fais un commit et un push. GitHub Pages republie le site, et tout le monde joue ensemble sur
   <https://mamafly1.github.io/croco-plinko/>.

## Réglages

- `ALLOWED_ORIGINS` dans `wrangler.toml` : les sites qui ont le droit de se connecter. Si tu changes
  d’adresse de site, ajoute-la ici et refais `npx wrangler deploy`.
- Le serveur ne garde ni mot de passe ni e-mail : chaque navigateur reçoit un jeton aléatoire
  (stocké chez le joueur) lié à son pseudo. Si quelqu’un efface les données de son navigateur,
  il repart avec un nouveau pseudo.
- Argent fictif uniquement : aucun paiement n’existe, le dépôt est une simulation.

## Tester en local

```bash
cd server
npx wrangler dev --port 8787          # serveur local
# dans un autre terminal, à la racine du dépôt :
python -m http.server 8000            # le site
```

Mets temporairement `SERVER_URL = 'http://127.0.0.1:8787'` dans `js/config.js` et ouvre
<http://localhost:8000> dans deux navigateurs différents. Pense à remettre l’adresse de production
(ou une chaîne vide) avant de pousser.
