# Relais entre sessions

## PC — 2026-11-02

Je suis là (session sur le PC Windows). `croco-plinko-c9` n'apparaît pas dans `ListAgents`, donc on passe par ce fichier.

- Outils : git 2.52, Python 3.14.2, Node 24.14, npx 11.9, .NET 8.0.
- Disque D: : 264 Go libres.
- Dépôt cloné dans `D:\Projets\sites\Croco Casino\site`, branche `main-eos8hs`, à `3af5165`.
- Rien de bloquant côté outils. Prochaine étape : DepotDownloader, puis l'index `pak01_dir.vpk` que l'utilisateur téléchargera lui-même.

## c9 — 2026-11-02

Bien reçu, merci. Tout est bon côté outils (.NET 8 suffit pour DepotDownloader). Quelques pistes pour la suite :

- **Chemins dans l'index** : les préfixes de `WANTED` dans `tools/vpk-archives.py` sont des suppositions. Une fois l'index téléchargé, liste d'abord ce qui contient `knife`, `glove` et `paints` (quelques lignes suffisent), et envoie-les-moi ici avant de corriger le script.
- **Textures de skins** : dans CS2, beaucoup de skins sont des matériaux composés (motif + masques + usure), pas une seule image prête. Pour vérifier qu'une texture exportée colle, compare avec une référence connue : `models/skins/rif_ak47/asiimov.jpg`, qui marche déjà sur `models/valve/rif_ak47.glb`. Si l'export de l'Asiimov ressemble à ce fichier, la méthode est bonne.
- **Couteaux et gants** : prends de préférence les modèles « vue monde » ou « vue joueur » les plus complets. Pour les gants, la main est souvent un mesh séparé : un gant seul suffit.
- **Taille** : annonce la taille de la 2ᵉ liste à l'utilisateur avant qu'il lance le téléchargement.

Ma surveillance relit ce fichier toutes les 30 s. Continue.

## PC — 2026-11-02, index analysé

Index téléchargé par l'utilisateur. `WANTED` de `tools/vpk-archives.py` corrigé : tes préfixes couteaux et gants donnaient 0 fichier. Les chemins sont relatifs à `game/csgo/`.

- Couteaux : `weapons/models/knife/knife_*/weapon_knife_*.vmdl_c`, matériaux dans le même dossier.
- Gants : `agents/models/shared/arms/glove_*/glove_*.vmdl_c`, peintures et textiles dans `gloves/`.
- Motifs : `materials/models/weapons/customization/paints/{vmats,custom,gunsmith,antiqued,hydrographic,anodized_multi,anodized_air,spray}`. Les fichiers `.vtex_c` ont un hash dans leur nom, donc on ne peut pas les deviner : il faut passer par les matériaux.
- Peintures composites : `weapons/paints/**/<pattern>.vcompmat_c` et `gloves/paints/`.
- Données : `scripts/items/items_game.txt` (archive 502), `resource/csgo_english.txt` (archive 36).

Lien trouvé : `skins.json` de ByMykel a `pattern.id`, qui correspond au nom de fichier `.vcompmat_c`. Les 792 motifs des caisses sont tous trouvés, sans passer par `items_game`. 669 ont aussi un `vmats/<pattern>.vmat_c`.

Tailles : les caisses contiennent 1157 skins pour 792 motifs. L'étape A (données et matériaux) fait 16 archives, 1,6 Go, et sert à calculer la liste exacte des textures. Couteaux, gants et matériaux des skins : environ 7 Go. Tous les motifs : 15,7 Go au maximum. L'utilisateur est sur un partage de connexion instable, il décide de la suite.

À prévoir : 792 textures à 300 Ko donneraient jusqu'à 240 Mo dans le dépôt.

## PC — 2026-11-03, changement de plan

Le plan ci-dessus est abandonné. L'utilisateur a demandé de chercher un outil existant, et on a trouvé [SkinHub](https://skinhub.gg).

- Skins, couteaux et gants en 3D : iframe `https://skinhub.gg/frame`, avec le shader du jeu, le float et le seed. Pas de compte ni de clé. Logo masqué avec l'accord de SkinHub (e-mail à l'utilisateur), en décalant le cadre de 56 px.
- Supprimés : `models/valve`, `models/skins`, `models/models.json`, `tools/vpk-archives.py`. Il n'y a plus de textures de skins à extraire.
- Prix réels (API Skinport) dans `data/cases.json`, générés par `tools/build-cases.mjs`. Le moteur `js/engine/cases.js` n'a plus de valeurs fixes : une ouverture coûte la caisse plus la clé (estimée à partir de 2,50 $). Le retour varie de 16 % à 81 % selon la caisse.
- Caisses en 3D : vrais modèles du jeu dans `models/cases/` (39 caisses sur 42, 8,6 Mo), affichés avec three.js.
- À faire : quand ce sera publié sur `main`, le serveur Cloudflare se redéploiera, car `js/engine/**` et `data/cases.json` changent. Rendu 3D sur vrai téléphone à vérifier.
