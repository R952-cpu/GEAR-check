# Gear Check

**Assistant de préparation caméra.** Une application web légère pour les
assistant·e·s vidéo : elle transforme une liste de matériel de loueur en
checklist de vérification, puis sert à pointer le matériel et à consigner les
défauts constatés pendant le tournage.

Elle tourne chez vous, sur votre machine, sans compte ni service tiers. Les
données ne quittent jamais votre réseau.

---

## À quoi ça sert

Le jour de la prépa, un·e assistant·e caméra reçoit un bon de préparation du
loueur : plusieurs pages de matériel. Il faut vérifier que tout est là, que
tout fonctionne, noter ce qui manque, puis rendre compte à la production.

Gear Check couvre ce parcours de bout en bout :

**1. Import** — Vous donnez le bon de préparation à une IA (Gemini, Claude,
ChatGPT) avec le prompt fourni par l'application, et vous collez le JSON
obtenu. L'inventaire est créé en quelques secondes.

**2. Inventaire** — Tout le matériel importé, groupé par catégorie, avec une
case de présence par article. C'est le pointage : ce qui est physiquement là.

**3. Checklist** — Des phases de vérification sont créées **automatiquement**
selon le matériel présent. Une phase « Optiques » n'existe que s'il y a des
optiques. Chaque article reçoit les points de contrôle correspondant à sa
nature, issus du référentiel des assistant·e·s opérateur·rice·s : calage
optique, tenue des batteries, portée de la liaison HF, réglages menu caméra…

**4. Réglages caméra** — Des profils partagés entre plusieurs caméras
identiques : une couleur, une liste de réglages menu à appliquer et à cocher
sur chaque boîtier.

**5. Manques** — La liste de ce qu'il faut réclamer au loueur, exportable en
PDF.

**6. Compte-rendu de prépa** — Un PDF rédigé en langage clair, destiné à
quelqu'un qui ne connaît pas le matériel : « Présent — prêt », « Présent —
vérification en cours », « Absent », avec vos remarques.

**7. Comptes-rendus de tournage** — Semaine par semaine : les défauts
constatés avec photos, et des notes libres colorées. Exportables en PDF.

---

## Le point délicat : lire un bon de préparation

C'est là que l'application fait le plus de travail invisible.

Un bon de préparation n'est pas une liste plate. C'est une arborescence : une
ligne de lot, puis ses composants indentés en dessous.

```
5   Sony FX6 COMBO
        5   Sony FX6 Camescope 4K E-mount Corp Nu
        5   Sony FX6 / FX9 Viseur View Finder
        5   Adaptateur d'Alim Sony AC
        5   Sony FX6 Poignée Top
```

Une fois le document aplati en texte, l'indentation disparaît. Une IA compte
alors 5 « FX6 COMBO » **plus** 5 corps caméra : **10 caméras au lieu de 5**.

Le piège, c'est que la règle « ignorer la ligne de lot » est fausse une fois
sur deux :

| Ligne parente | Ses sous-lignes | Verdict |
|---|---|---|
| `Sony FX6 COMBO` | contiennent le corps nu | étiquette de lot → à ignorer |
| `DJI SDR COMBO` | RX + TX = tout le système | étiquette de lot → à ignorer |
| `Objectif Sony FE 24-105` | bouchons, pochette, filtre UV | **le vrai objectif** → à garder |
| `Godox FL-100 COMBO` | seulement la télécommande | **le vrai projecteur** → à garder |

Le critère n'est donc pas le mot « COMBO » — beaucoup de loueurs regroupent
sans jamais l'écrire — mais :

> **Le matériel principal de la ligne parente se retrouve-t-il parmi ses
> sous-lignes ?** Si oui, la parente n'est qu'une étiquette. Sinon, elle est
> le matériel.

Ce raisonnement est expliqué à l'IA dans le prompt, **et** doublé côté serveur
par un filet de sécurité qui repère les lignes de lot dont tout le contenu est
détaillé ailleurs. Ce filet ne supprime jamais rien : la ligne reste visible
dans l'inventaire, elle cesse simplement de compter deux fois.

Le serveur rattrape aussi les autres approximations courantes des modèles :
catégories reformulées (« objectif » au lieu de `OPTIQUE`), quantités écrites
en toutes lettres, sous-types d'optique manquants, caméras groupées sur une
seule ligne.

---

## Installation

### Ce qu'il faut

- [Docker](https://docs.docker.com/get-docker/) avec Docker Compose
- Rien d'autre : ni base de données à installer, ni compte à créer

### Mise en route

```bash
git clone https://github.com/R952-cpu/GEAR-check.git
cd GEAR-check
cp .env.example .env
```

Ouvrez `.env` et ajustez au moins `DATA_PATH` (voir la section Configuration),
puis :

```bash
docker compose up -d --build
```

L'application répond sur `http://localhost:3001`. Depuis un téléphone du même
réseau, utilisez l'adresse IP de la machine, par exemple
`http://192.168.1.20:3001`.

Sur iPhone, « Partager → Sur l'écran d'accueil » l'installe comme une
application : elle s'ouvre alors en plein écran, sans barre de navigateur.

### Sans Docker

```bash
npm install
DATA_DIR=./data npm start
```

L'application écoute sur le port 3000 par défaut.

---

## Configuration

Tout se règle dans le fichier `.env`, qui n'est jamais publié.

| Variable | Défaut | À quoi ça sert |
|---|---|---|
| `DATA_PATH` | `./data` | Où sont stockées la base et les photos. Un disque externe convient très bien : indiquez son point de montage. |
| `HOST_PORT` | `3001` | Port d'écoute sur la machine hôte. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Noms d'hôte autorisés à joindre l'application. N'ajoutez ici que des **noms de domaine** : les adresses IP privées sont déjà acceptées. |
| `ALLOW_PRIVATE_HOSTS` | `true` | Accepte toute adresse IP privée (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`), ce qui couvre le réseau local et un tunnel VPN. |
| `BACKUP_DIR` | *(vide)* | Chemin **dans le conteneur** où écrire les copies de sécurité. Vide = désactivé. Mettre `/sauvegardes` pour activer. |
| `BACKUP_PATH` | `./backups` | Dossier **sur la machine hôte** correspondant. À placer sur un autre disque que `DATA_PATH`. |

Réglages plus fins, à passer en variables d'environnement si besoin :

| Variable | Défaut | À quoi ça sert |
|---|---|---|
| `BACKUP_INTERVAL_MS` | `600000` | Intervalle entre deux sauvegardes (10 minutes). |
| `BACKUP_KEEP` | `8` | Nombre de sauvegardes conservées avant rotation. |
| `UPLOAD_MAX_BYTES` | `31457280` | Taille maximale d'un fichier envoyé (30 Mo). |
| `JSON_MAX_BYTES` | `8mb` | Taille maximale d'un corps de requête JSON. |
| `RATE_LIMIT_MAX` | `1200` | Requêtes autorisées par adresse et par fenêtre. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Durée de la fenêtre de comptage. |

### Choisir le port avec précaution

Évitez un port déjà occupé par un autre service. Si vous développez avec un
outil qui surveille un port (panneau de prévisualisation, serveur de
développement), ne lui faites **jamais** surveiller le port utilisé par le
conteneur : il tuerait le processus qui le détient, et le conteneur partirait
en boucle de redémarrage. C'est la raison d'être de `HOST_PORT`.

---

## Sauvegardes

Elles sont **désactivées par défaut**. Pour les activer, dans `.env` :

```dotenv
BACKUP_DIR=/sauvegardes
BACKUP_PATH=/chemin/vers/un/autre/disque
```

Une copie cohérente de la base est alors écrite toutes les dix minutes, les
huit dernières étant conservées. La copie se fait par `VACUUM INTO`, qui
produit un fichier valide même pendant que l'application écrit — à la
différence d'une simple copie de fichier.

> Le dossier de destination doit se trouver sur un **autre disque** que
> `DATA_PATH`. Une sauvegarde posée à côté de l'original ne protège que d'une
> corruption logique, pas d'une panne ou d'un débranchement.

---

## Sécurité

L'application **n'a pas d'authentification**. C'est un choix assumé, pas un
oubli : elle est conçue pour tourner sur un réseau dont l'accès est déjà
restreint — un réseau local domestique, ou un tunnel VPN pour l'accès distant.

**Ne l'exposez pas directement sur Internet.** Toute personne capable de
joindre le port aura un accès complet en lecture et en écriture.

Cela posé, les protections suivantes sont en place :

- **Anti-DNS-rebinding** — Un site web piégé ouvert sur votre téléphone ne peut
  pas faire pointer son domaine vers l'application et la piloter à votre insu.
- **Anti-CSRF** — Les requêtes d'écriture venant d'une autre origine sont
  refusées.
- **Envois de fichiers** — Liste blanche stricte (images et PDF, jamais de
  SVG), nom de fichier entièrement régénéré côté serveur, type MIME imposé à la
  lecture, `nosniff`, et une politique de contenu qui empêche toute exécution.
- **Échappement systématique** — L'import accepte du JSON produit par une IA à
  partir d'un document tiers : ces désignations sont traitées comme des entrées
  non fiables.
- **Politique de sécurité du contenu** — Aucune ressource externe ne peut être
  chargée, ce qui coupe toute voie d'exfiltration. L'application ne fait
  d'ailleurs aucune requête sortante et fonctionne entièrement hors ligne.
- **Bornes partout** — Taille des corps de requête, nombre de fichiers, nombre
  de lignes importées, quantités, limitation de débit.
- **Conteneur non privilégié** et arrêt propre qui ferme la base avant de
  rendre la main.

---

## Développement

```bash
npm run check    # contrôle syntaxique de tous les fichiers serveur
npm test         # tests du référentiel et de la normalisation de l'import
```

Un test fonctionnel complet de l'API est fourni. Il crée un projet de test,
exerce toutes les routes, puis le supprime — à lancer contre une instance
jetable, jamais contre vos données réelles :

```bash
BASE=http://127.0.0.1:4599 bash tests/api.smoke.sh
```

### Sous le capot

Node/Express, SQLite, et du HTML/CSS/JavaScript sans aucun framework ni étape
de compilation. Le fichier [ARCHITECTURE.md](ARCHITECTURE.md) cartographie
l'ensemble des fichiers et consigne les décisions techniques qu'il vaut mieux
ne pas défaire.

Le front utilise des scripts classiques et non des modules ES : l'interface
repose sur des attributs `onclick`, qui ont besoin de fonctions globales.

---

## Licence

**PolyForm Noncommercial License 1.0.0** — voir [LICENSE](LICENSE).

Vous pouvez utiliser, modifier, adapter et redistribuer ce logiciel
librement, **à des fins non commerciales**. L'usage personnel, l'étude, les
projets amateurs, ainsi que l'usage par les associations, les établissements
d'enseignement et les institutions publiques sont expressément autorisés.

Toute exploitation commerciale nécessite une autorisation écrite. Pour la
demander, passez par le profil GitHub indiqué dans le fichier LICENSE.

Copyright 2026 Ronan Jaouën.
