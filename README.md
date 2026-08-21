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

Vous lui donnez un titre, et chaque document reçoit un **numéro de version**
attribué automatiquement — une prépa s'étale souvent sur plusieurs jours, et
il arrive de devoir rééditer un compte-rendu. Une précision facultative
accompagne le numéro (« Jour 2 », « Rectificatif »…). Des **photos légendées**
peuvent être ajoutées en fin de document, au moment de la génération ou plus
tard sur un compte-rendu déjà archivé.

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

L'application se configure entièrement par variables d'environnement. Le dépôt
ne contient que des **modèles** : vous en faites une copie, que git ignore, et
votre configuration reste chez vous.

### Avec Docker Compose — le plus simple

```bash
git clone https://github.com/R952-cpu/GEAR-check.git
cd GEAR-check
cp docker-compose.example.yml docker-compose.yml
cp .env.example .env
```

Ouvrez `.env`, ajustez au moins `DATA_PATH` et `HOST_PORT` (voir
[Configuration](#configuration)), puis :

```bash
docker compose up -d --build
```

L'application répond sur `http://localhost:8080` — ou sur le port que vous avez
choisi. Depuis un téléphone du même réseau, utilisez l'adresse IP de la
machine, par exemple `http://192.168.1.20:8080`.

Sur iPhone, « Partager → Sur l'écran d'accueil » l'installe comme une
application : elle s'ouvre alors en plein écran, sans barre de navigateur.

### Avec Docker, sans Compose

```bash
docker build -t gear-check .
docker run -d --name gear-check \
  -p 8080:3000 \
  -v /chemin/vers/vos/donnees:/data \
  -e DATA_DIR=/data \
  -e ALLOWED_HOSTS=localhost,127.0.0.1 \
  --restart unless-stopped \
  gear-check
```

### Sans Docker, directement avec Node

Node 20 ou plus récent. La compilation du module SQLite demande des outils de
build (`build-essential` et `python3` sur Debian/Ubuntu, `xcode-select
--install` sur macOS).

```bash
npm ci --omit=dev
DATA_DIR=./data PORT=3000 npm start
```

---

## Déploiement sur un serveur distant

> ### ⚠️ À lire avant tout
>
> **L'application n'a aucune authentification.** Elle est conçue pour un
> réseau dont l'accès est déjà restreint. Si vous la posez sur un VPS
> accessible depuis Internet **sans rien devant**, n'importe qui pourra lire,
> modifier et effacer toutes vos données — il suffit de trouver l'adresse.
>
> Deux façons correctes de procéder, au choix :
>
> 1. **Un VPN** (WireGuard, Tailscale…) : l'application n'écoute que sur
>    l'interface du tunnel, rien n'est exposé publiquement. C'est le plus sûr.
> 2. **Un reverse proxy qui exige un mot de passe** avant de laisser passer
>    quoi que ce soit. C'est la méthode décrite ci-dessous.

### Reverse proxy avec authentification

Exemple avec [Caddy](https://caddyserver.com/), qui gère le certificat HTTPS
tout seul. Générez d'abord une empreinte de mot de passe :

```bash
caddy hash-password
```

Puis dans votre `Caddyfile` :

```caddyfile
gear.exemple.org {
    basic_auth {
        # Sur Caddy antérieur à 2.8, la directive s'appelle « basicauth ».
        votre-identifiant $2a$14$empreinte_generee_ci_dessus
    }
    reverse_proxy 127.0.0.1:8080
}
```

L'équivalent avec Nginx passe par `auth_basic` et un fichier `htpasswd`, plus
un certificat obtenu via Certbot.

### Le réglage à ne pas oublier

Derrière un reverse proxy, le nom de domaine doit figurer dans
`ALLOWED_HOSTS`, sinon **l'application répondra `403 Hote non autorise`** :

```dotenv
ALLOWED_HOSTS=gear.exemple.org
ALLOW_PRIVATE_HOSTS=false
```

C'est la protection anti-DNS-rebinding qui fait son travail — elle ne connaît
pas encore votre domaine. Pensez aussi à ne publier le port qu'en local
(`127.0.0.1:8080:3000` dans la section `ports`), pour que seul le proxy puisse
joindre l'application.

### En service système, sans Docker

```ini
# /etc/systemd/system/gear-check.service
[Unit]
Description=Gear Check
After=network.target

[Service]
Type=simple
User=gearcheck
WorkingDirectory=/opt/gear-check
Environment=DATA_DIR=/var/lib/gear-check
Environment=PORT=3000
Environment=ALLOWED_HOSTS=gear.exemple.org
ExecStart=/usr/bin/node server.js
Restart=on-failure

# Le service n'a besoin d'écrire que dans son dossier de données.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/gear-check

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now gear-check
```

---

## Configuration

Tout se règle dans votre `.env`, qui n'est jamais publié.

| Variable | Défaut | À quoi ça sert |
|---|---|---|
| `DATA_PATH` | `./data` | Où sont stockées la base et les photos. Un disque externe convient très bien : indiquez son point de montage. |
| `HOST_PORT` | `8080` | Port d'écoute sur la machine hôte. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1]` | Noms d'hôte autorisés à joindre l'application. Ajoutez-y votre **nom de domaine** si vous passez par un reverse proxy. |
| `ALLOW_PRIVATE_HOSTS` | `true` | Accepte toute adresse IP privée (`192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`), ce qui couvre le réseau local et un tunnel VPN. À passer à `false` sur un serveur public. |
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
conteneur : certains tuent le processus qui détient le port, et le conteneur
part alors en boucle de redémarrage. C'est la raison d'être de `HOST_PORT`.

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

## Contribuer

Les issues et les Pull Requests sont bienvenues. Avant de vous lancer, lisez
[CONTRIBUTING.md](CONTRIBUTING.md) : il précise les conventions du projet, les
trois choix techniques à ne pas défaire, et le point sur la licence — toute
contribution est distribuée sous la même licence non commerciale que le reste
du projet.

Pour une **faille de sécurité**, n'ouvrez pas d'issue publique : passez par
l'onglet *Security* du dépôt.

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
