# Serveur multijoueur de Croco Casino

Le site reste sur GitHub Pages. Ce dossier contient le petit serveur qui permet de jouer ensemble :
solde commun à tous les jeux, classement partagé, fil des parties en direct, roulette en tours partagés
et table de blackjack visible par tous.

Il tourne sur **Cloudflare Workers** avec un **Durable Object** (base SQLite intégrée). Les tirages
(roulette, cartes, caisses…) sont faits sur le serveur avec les mêmes règles que le mode solo
(`js/engine/`), pour que personne ne puisse tricher au classement en modifiant la page.

Tant que `js/config.js` est vide, le site fonctionne en **mode solo** : rien ne casse.

## Mettre le serveur en ligne (une seule fois, tout depuis le navigateur)

Le serveur tourne chez Cloudflare, pas sur ton PC. C'est GitHub qui l'envoie, rien à installer.

1. Crée un compte gratuit sur <https://dash.cloudflare.com/sign-up>. Les Durable Objects avec stockage
   SQLite sont disponibles sur l’offre gratuite ; vérifie les limites du moment sur
   <https://developers.cloudflare.com/durable-objects/platform/pricing/>.
2. Dans Cloudflare : **Workers et Pages**, note ton **Account ID** (colonne de droite).
3. Toujours dans Cloudflare : ton profil, **API Tokens**, **Create Token**, modèle
   **« Edit Cloudflare Workers »**, puis **Create**. Copie la clé (elle ne s'affiche qu'une fois).
4. Sur GitHub, dans le dépôt : **Settings**, **Secrets and variables**, **Actions**,
   **New repository secret**, et crée deux secrets :
   - `CLOUDFLARE_API_TOKEN` : la clé de l’étape 3 ;
   - `CLOUDFLARE_ACCOUNT_ID` : l’identifiant de l’étape 2.
5. Sur GitHub : onglet **Actions**, **Déployer le serveur**, **Run workflow**. Au bout d’une minute,
   le journal affiche une adresse du type `https://croco-casino.TON-NOM.workers.dev`.
6. Vérifie qu’il répond : ouvre `https://croco-casino.TON-NOM.workers.dev/health`, tu dois voir `ok`.
7. Mets cette adresse dans `js/config.js` (bouton crayon sur GitHub) :

   ```js
   export const SERVER_URL = 'https://croco-casino.TON-NOM.workers.dev';
   ```

   GitHub Pages republie le site, et tout le monde joue ensemble sur
   <https://mamafly1.github.io/croco-casino/>.

Ensuite, chaque modification du serveur poussée sur `main` est renvoyée automatiquement.

Ne mets jamais la clé Cloudflare dans un fichier du dépôt : il est public. Seulement dans les secrets.

Variante en ligne de commande, si un jour tu préfères : `cd server`, `npx wrangler login`, `npx wrangler deploy`.

## Panneau admin

`admin.html` (pas de lien dans le menu) permet de voir tous les joueurs, changer un solde, redonner des
tâches de travail pour la journée, effacer un code oublié, déconnecter ou supprimer un compte, et remettre tout le monde à zéro.

Il est protégé par un mot de passe : crée le secret **`ADMIN_KEY`** sur GitHub (même page que les autres
secrets), puis relance « Déployer le serveur ». Après 5 mauvais mots de passe, l'admin est bloqué 1 minute.

## Recherche de gifs (Klipy)

La recherche de gifs passe par le serveur, qui garde la clé Klipy. Crée une clé d’API sur
[partner.klipy.com](https://partner.klipy.com), puis le secret **`KLIPY_KEY`** sur GitHub (même page que les autres
secrets) et relance « Déployer le serveur ». Sans ce secret, seuls le gif du croco, l’import d’image et les liens marchent.

## Réglages

- `ALLOWED_ORIGINS` dans `wrangler.toml` : les sites qui ont le droit de se connecter. Si tu changes
  d’adresse de site, ajoute-la ici et refais `npx wrangler deploy`.
- Le serveur ne garde ni mot de passe ni e-mail : chaque navigateur reçoit un jeton aléatoire
  (stocké chez le joueur) lié à son pseudo. Si quelqu’un efface les données de son navigateur,
  il repart avec un nouveau pseudo.
- Argent fictif uniquement : aucun paiement n’existe. L’argent se gagne avec le travail du jour (3 tâches, 90 à 120 €).

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
