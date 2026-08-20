# Contribuer à Gear Check

Merci de l'intérêt que vous portez au projet. Il est né d'un besoin concret de
tournage, et il évolue au rythme de ce besoin — les contributions sont les
bienvenues, dans ce cadre.

---

## Avant tout : la licence

Ce projet est distribué sous la **PolyForm Noncommercial License 1.0.0**
(voir [LICENSE](LICENSE)). Ce n'est pas une licence open source au sens de
l'OSI : elle autorise l'usage, la modification et la redistribution, mais
**pas l'exploitation commerciale**.

> **En proposant une contribution, vous acceptez qu'elle soit distribuée sous
> cette même licence, et vous confirmez avoir le droit de la soumettre** —
> c'est-à-dire que le code est le vôtre, ou que vous êtes autorisé à le
> proposer.

Ce point n'est pas une formalité : sans lui, le projet finirait avec des
morceaux au statut juridique flou, impossibles à distribuer proprement. Une
contribution dont l'origine n'est pas claire sera refusée, même si elle est
bonne.

---

## Signaler un bug ou proposer une idée

Ouvrez une **issue**. C'est souvent plus utile qu'un correctif direct, parce
que ça laisse la place à la discussion sur l'approche.

Pour un bug, ce qui aide vraiment :

- ce que vous faisiez, ce que vous attendiez, ce qui s'est passé
- la configuration (Docker ou Node, système, version de Node)
- les journaux du conteneur (`docker compose logs`) si le serveur est en cause
- la console du navigateur si c'est l'interface

Si le bug concerne l'import d'une liste de loueur, **joignez un extrait
anonymisé** du document et le JSON produit par l'IA. C'est la seule façon de
reproduire — et pensez à retirer les noms de production et de client.

### Une faille de sécurité

**N'ouvrez pas d'issue publique.** Passez par l'onglet *Security* du dépôt,
« Report a vulnerability », qui crée un fil privé. À défaut, contactez le
titulaire des droits via son profil GitHub.

Le modèle de menace du projet est décrit dans le [README](README.md#sécurité) :
l'application n'a volontairement pas d'authentification et suppose un réseau
déjà restreint. Un rapport qui se résume à « il n'y a pas de mot de passe »
n'apporte donc rien. En revanche, tout ce qui permettrait à un tiers de
franchir cette hypothèse — injection, contournement du filtre d'hôte, exécution
de code depuis un fichier envoyé ou un JSON importé — mérite un signalement.

---

## Proposer du code

1. **Forkez** le dépôt et créez une branche depuis `main`.
2. Faites vos modifications.
3. **Vérifiez** avant de proposer :

   ```bash
   npm run check    # syntaxe de tous les fichiers serveur
   npm test         # référentiel et normalisation de l'import
   ```

   Pour une modification touchant l'API, lancez aussi le test fonctionnel
   complet contre une instance jetable — **jamais contre des données
   réelles** :

   ```bash
   BASE=http://127.0.0.1:4599 bash tests/api.smoke.sh
   ```

4. Ouvrez une **Pull Request** en expliquant le problème résolu, pas seulement
   le changement effectué.

Chaque proposition est relue et acceptée ou refusée par le mainteneur. Un refus
n'est pas un jugement sur la qualité du code : le plus souvent, c'est une
question de périmètre.

---

## Conventions

**Le projet est en français** — code, commentaires, interface, messages de
commit. C'est délibéré : il s'adresse à des technicien·ne·s de tournage
francophones, et le vocabulaire métier n'a pas d'équivalent anglais naturel.

**Les commentaires expliquent le *pourquoi*, pas le *quoi*.** Le code dit déjà
ce qu'il fait. Un commentaire utile explique une contrainte, un piège, ou la
raison d'un choix qui paraîtrait bizarre sans contexte.

**Aucune étape de compilation.** Pas de bundler, pas de transpileur, pas de
framework front. On ouvre un fichier, on le modifie, ça marche.

**Pas de nouvelle dépendance sans nécessité.** Chaque paquet ajouté est une
surface d'attaque et une maintenance de plus. Si la bibliothèque standard de
Node suffit, elle suffit.

### Trois choix à ne pas défaire

Ils viennent d'incidents réels et sont documentés dans
[ARCHITECTURE.md](ARCHITECTURE.md) :

- **SQLite reste en `journal_mode = DELETE`**, pas en WAL. Le fichier de
  mémoire partagée du WAL ne survit pas au pont entre l'hôte et le conteneur
  quand la base est sur un disque externe monté en bind.
- **Le front utilise des scripts classiques, pas des modules ES.** L'interface
  repose sur des attributs `onclick`, qui ont besoin de fonctions globales.
  Passer en modules casserait tout.
- **Toute donnée réinjectée dans du HTML passe par `esc()`**, y compris dans
  les attributs. L'import accepte du JSON produit par une IA à partir d'un
  document tiers : ces valeurs ne sont pas fiables.

### Le référentiel matériel

Les catégories, types et points de contrôle (`src/referentiel.js`) viennent de
la pratique des assistant·e·s opérateur·rice·s. Une proposition d'ajout ou de
correction est très bienvenue, mais argumentez-la depuis le métier : pourquoi
ce contrôle, à quel moment de la prépa, sur quel type de matériel.

---

## Ce qui sera probablement refusé

Pour ne pas vous faire perdre de temps :

- L'ajout d'un framework front ou d'une étape de build
- Une réécriture en TypeScript
- Un système de comptes utilisateurs — l'application est mono-utilisateur par
  conception, et l'ajouter changerait la nature du projet
- La traduction de l'interface en anglais
- Des changements de style purement esthétiques sur du code existant

Si vous avez un doute sur le périmètre, **ouvrez une issue avant d'écrire du
code**. C'est toujours moins frustrant que de voir refuser une Pull Request
déjà terminée.
