# Croco Casino

Casino de démonstration, **argent fictif uniquement** : Plinko, roulette européenne, blackjack,
ouverture de caisses CS2 et machine à sous, avec un solde commun, un classement et un fil en direct.

En ligne : <https://mamafly1.github.io/croco-plinko/>

## Contenu

| Fichier | Rôle |
| --- | --- |
| `index.html` | Accueil : jeux, classement, fil en direct |
| `plinko.html`, `roulette.html`, `blackjack.html`, `caisses.html`, `slots.html` | Les jeux |
| `js/engine/` | Règles et tirages, partagés par le navigateur (mode solo) et le serveur |
| `js/core.js` | Solde, connexion au serveur, en-tête, dépôt simulé |
| `js/config.js` | Adresse du serveur multijoueur (vide = mode solo) |
| `data/cases.json` | Les 42 caisses CS2 et leur contenu, généré par `tools/build-cases.mjs` |
| `server/` | Serveur multijoueur (Cloudflare Worker), voir `server/README.md` |
| `models/cases/` | Modèles 3D des caisses, extraits des fichiers du jeu (`models/cases.json` : id de caisse vers fichier) |
| `vendor/three/` | three.js 0.170.0 (licence MIT), pour l’affichage 3D des caisses |

## Sources des données des caisses

- Contenu des caisses, raretés, plages de float, StatTrak : [ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API),
  extrait des fichiers du jeu. Les images viennent du CDN de Steam.
- Taux par rareté (79,92 / 15,98 / 3,20 / 0,64 / 0,26 %) : taux rendus publics par Valve, tels que repris par de nombreux sites (page d’origine non consultée).
- Prix en euros : API publique de [Skinport](https://docs.skinport.com/), au moment de la génération. Une usure absente
  du marché prend le prix de l’usure la plus proche. La clé est estimée à partir de ses 2,50 $.
- Skins, couteaux et gants en 3D : visualiseur [SkinHub](https://skinhub.gg) intégré en iframe. Son logo est masqué avec
  l’accord de SkinHub (réponse par e-mail du 2 novembre 2026).

Pour mettre à jour la liste et les prix : `node tools/build-cases.mjs`.

## Tester en local

```bash
python -m http.server 8000
```

puis ouvre <http://localhost:8000>. (Les pages utilisent des modules JavaScript : les ouvrir en
double-cliquant sur le fichier ne marche pas, il faut passer par un petit serveur.)
