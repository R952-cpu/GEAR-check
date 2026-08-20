# Architecture — notes pour travailler sur ce code

Application de préparation caméra : checklist matériel et comptes-rendus de
tournage. Node/Express + SQLite + HTML/JS sans framework, servie par Docker,
pensée pour être consultée depuis un téléphone sur le réseau local ou un VPN.

La configuration propre à chaque machine (chemins disque, port, hôtes
autorisés) vit dans un fichier `.env` non publié — voir `.env.example`.

## Règles à ne pas enfreindre

1. **Ne jamais faire surveiller par un outil externe un port occupé par
   Docker.** Un panneau de prévisualisation qui « prend » le port tue le
   processus qui le détient, ce qui met le conteneur en boucle de redémarrage.
   C'est la raison du port hôte configurable (`HOST_PORT`). Pour un harnais de
   test, utiliser un port neutre et le nettoyer après.
2. **Ne jamais tester sur les données réelles.** Créer un projet de test isolé
   (`POST /api/projects`), le manipuler, puis le supprimer. Pour un test
   fidèle, travailler sur une **copie** de la base dans un conteneur séparé.
3. **Ne pas passer SQLite en WAL.** Le fichier de mémoire partagée `-shm` ne
   survit pas au pont entre l'hôte et le conteneur quand la base est sur un
   disque externe monté en bind. `journal_mode = DELETE` est un choix
   délibéré, documenté dans `src/db.js`.
4. **Sauvegarder avant toute opération risquée sur les données.**

## Carte du code

```
server.js                   démarrage : middlewares, montage des routes, écoute
src/config.js               chemins, port, réglages de sécurité (via .env)
src/db.js                   connexion SQLite, helpers Promise, transactions
src/schema.js               tables, index, migrations (idempotent au démarrage)
src/referentiel.js          catégories, types, checks, normalisation du JSON de l'IA
src/middleware.js           sécurité, envoi de fichiers, gestion d'erreurs
src/backup.js               copies de sécurité périodiques (désactivées par défaut)
src/routes/projects.js      projets, manques, pièces jointes
src/routes/checklist.js     inventaire, import, phases, checks
src/routes/camera.js        profils de réglages caméra
src/routes/rapports.js      comptes-rendus de prépa archivés
src/routes/compteRendus.js  comptes-rendus de tournage, défauts, photos

public/index.html           structure HTML seule
public/css/app.css          design « liquid glass »
public/vendor/              jsPDF, servi localement (aucun CDN)
public/js/core.js           état partagé S, appels API, mise à jour optimiste
public/js/nav.js            navigation et chargement des données
public/js/ecrans.js         accueil, écran projet, onglets
public/js/inventaire.js     onglet Inventaire
public/js/import.js         prompt IA et import du JSON
public/js/checklist.js      onglet Checklist
public/js/phases.js         gestion des phases
public/js/camera.js         onglet Réglages
public/js/manques.js        onglet Manques et son PDF
public/js/fichiers.js       onglet Fichiers
public/js/rapport-prepa.js  compte-rendu de prépa et son PDF
public/js/cr.js             comptes-rendus de tournage
public/js/pdf.js            export PDF et compression des photos
public/js/app.js            démarrage
```

Le front utilise des **scripts classiques, pas des modules ES** : l'interface
repose sur des attributs `onclick="..."` qui ont besoin de fonctions globales.
Passer en modules casserait toute l'interface.

## Commandes

```bash
npm run check    # syntaxe de tous les fichiers serveur
npm test         # tests du référentiel et de la normalisation
docker compose up -d --build --force-recreate regie

# Test fonctionnel complet de l'API, contre un conteneur d'essai
BASE=http://127.0.0.1:4599 bash tests/api.smoke.sh
```

## Points d'attention

**Import depuis une liste loueur.** Les bons de préparation sont
hiérarchiques : une ligne de lot suivie de ses composants indentés. Aplati en
JSON, un modèle compte le lot ET son contenu, doublant les quantités. Le
critère qui tranche n'est pas le mot « COMBO » mais : *le matériel principal de
la ligne parente se retrouve-t-il dans ses sous-lignes ?* Ce raisonnement est
expliqué à l'IA dans `CHECKLIST_PROMPT` (`public/js/import.js`) et doublé côté
serveur par `detecterLotsRedondants()` (`src/referentiel.js`), qui neutralise
le `type` sans jamais supprimer de ligne.

**Statuts.** La Checklist et le compte-rendu de prépa doivent juger un item sur
les **mêmes** checks — ceux que `visibleChecks()` rend visibles dans le mode en
cours. Les checks « avancés » sont masqués en mode simple et ne doivent pas
compter dans le statut, sinon le compte-rendu réclame des cases invisibles.

**Échappement.** Toute donnée réinjectée dans du HTML passe par `esc()`, y
compris dans les attributs. L'import accepte du JSON produit par une IA à
partir d'un document tiers : une désignation est une entrée non fiable.

**Dépendances.** `npm audit` signale des alertes sur `tar` / `node-gyp` /
`cacache` : elles proviennent de la chaîne de compilation de `sqlite3`, utilisée
uniquement pendant `npm install`. Ces paquets ne sont jamais chargés par
l'application en fonctionnement.
