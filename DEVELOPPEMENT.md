# Notes de développement

À lire avant de modifier le projet. La présentation générale est dans `README.md`.

## Principes

- Argent fictif uniquement : aucun vrai paiement, aucun retrait.
- Site statique, en JavaScript sans étape de build. Pas de framework, pas de dépendance sans vraie raison.
- Le texte du site reste honnête : les chances et le retour affichés sont ceux que le code applique.
- Le dépôt est public : aucune clé, aucun identifiant, aucun fichier brut du jeu (`.vpk`, exécutables).

## Commandes

```bash
python -m http.server 8000      # teste le site sur http://localhost:8000
node tools/build-cases.mjs      # régénère data/cases.json : caisses, contenu et prix
```

Il n'y a pas de suite de tests. Après un changement de règles, simule beaucoup de parties avec `js/engine/` pour
comparer le retour obtenu au retour calculé.

## Branches et publication

- On travaille sur `main-eos8hs`.
- `main` publie le site sur GitHub Pages.
- Un push sur `main` qui touche `server/**`, `js/engine/**` ou `data/cases.json` redéploie aussi le serveur Cloudflare.

## Architecture

- `js/engine/` contient les règles et les tirages, partagés par le navigateur (mode solo) et le serveur. Toute règle de
  jeu va ici, jamais dans une page.
- `js/pages/` contient l'interface de chaque jeu, `js/core.js` le solde, le serveur et l'en-tête.
- `server/` est le Worker Cloudflare du mode multijoueur. Il embarque `data/cases.json` : ce fichier doit rester léger.

## Caisses CS2

- **Données :** `data/cases.json` est généré, ne le modifie pas à la main. Contenu via ByMykel/CSGO-API, prix via Skinport.
- **Prix :** une ouverture coûte le prix de la caisse plus celui de la clé. `pr` donne le prix d'un objet par usure,
  `prs` sa version StatTrak. Les objets déjà dans un inventaire gardent la valeur enregistrée à leur ouverture.
- **Skins, couteaux et gants en 3D :** iframe `https://skinhub.gg/frame`, documentée dans le fichier `EMBED.md` du dépôt
  `SkinHubgg/skinhub-viewer`. La vue montre l'image officielle du skin tant que l'événement `ready` n'est pas arrivé.
- **Logo SkinHub :** `.skinframe` dans `caisses.html` le fait sortir du cadre, avec l'accord de SkinHub. Ne pas reprendre
  cette technique pour un autre usage sans leur redemander.
- **Caisses en 3D :** `models/cases/` contient les modèles du jeu, affichés par `js/viewer3d.js` (three.js). Trois caisses
  eSports n'en ont pas et gardent leur image.
