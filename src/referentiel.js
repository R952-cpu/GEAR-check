'use strict';
/**
 * Référentiel matériel : la source de vérité de toute l'app.
 *
 * Trois niveaux de classement, du plus large au plus fin :
 *  - `categorie` : regroupement d'affichage dans l'onglet Inventaire (9 valeurs).
 *  - `type`      : ce qui déclenche la création d'une phase de Checklist et
 *                  détermine les checks qualité attribués à l'item.
 *  - `sous_type` : variante d'un type dont les checks diffèrent (une optique
 *                  fixe et un zoom ne se vérifient pas pareil).
 *
 * Une phase de Checklist n'est jamais créée « au cas où » : elle n'existe que
 * si au moins un item du type correspondant figure dans le matériel importé.
 *
 * Le référentiel de checks est repris de la checklist AOA (assistants
 * opérateurs·trices associés), volontairement non tronqué : mieux vaut trop
 * que pas assez, l'utilisateur peut cocher en masse ce qui ne le concerne pas.
 */

const CATEGORIES_VALIDES = ['ENERGIE', 'CAMERA', 'OPTIQUE', 'VIDEO_HF', 'LUMIERE', 'MACHINERIE', 'AUDIO', 'ACCESSOIRE', 'DATA'];

// Définit chaque type : libellé de phase, sous-titre, catégorie d'inventaire parente.
const TYPE_DEFS = {
  ENERGIE:          { label: 'Énergie',            sub: 'Batteries, chargeurs',            categorie: 'ENERGIE' },
  CAMERA:           { label: 'Caméra',              sub: 'Boîtiers',                         categorie: 'CAMERA' },
  OPTIQUE:          { label: 'Optiques',            sub: 'Objectifs fixes & zooms',          categorie: 'OPTIQUE' },
  DOUBLEUR:         { label: 'Doubleur / Extendeur', sub: '',                                categorie: 'OPTIQUE' },
  FILTRES:          { label: 'Filtres',             sub: '',                                 categorie: 'OPTIQUE' },
  DIOPTRIES:        { label: 'Dioptries',           sub: '',                                 categorie: 'OPTIQUE' },
  MATTEBOX:         { label: 'Mattebox',            sub: '',                                 categorie: 'ACCESSOIRE' },
  COMMANDE_HF:      { label: 'Commande HF',         sub: 'Follow focus sans fil',            categorie: 'ACCESSOIRE' },
  EPAULE:           { label: 'Épaule',              sub: '',                                 categorie: 'ACCESSOIRE' },
  ULTRASON:         { label: 'Mesure à ultrason',   sub: '',                                 categorie: 'ACCESSOIRE' },
  FOLLOW_FOCUS:     { label: 'Follow focus',        sub: 'Manuel',                           categorie: 'ACCESSOIRE' },
  VISEUR_CHAMP:     { label: 'Viseur de champ',     sub: '',                                 categorie: 'ACCESSOIRE' },
  EASYRIG:          { label: 'Easyrig',             sub: '',                                 categorie: 'ACCESSOIRE' },
  VIDEO_HF:         { label: 'Vidéo & HF',          sub: 'Moniteurs, transmetteurs',         categorie: 'VIDEO_HF' },
  DATA:             { label: 'Data',                sub: 'Médias, disques, ordinateur',      categorie: 'DATA' },
  LUMIERE:          { label: 'Lumière',             sub: 'Sources',                          categorie: 'LUMIERE' },
  PROLONGS:         { label: 'Prolongs',            sub: 'Rallonges, multiprises',           categorie: 'LUMIERE' },
  TETE_MACHINERIE:  { label: 'Tête & pied',         sub: '',                                 categorie: 'MACHINERIE' },
  STABILISATEUR:    { label: 'Stabilisateur',       sub: '',                                 categorie: 'MACHINERIE' },
  ROULANTES:        { label: 'Roulantes',           sub: '',                                 categorie: 'MACHINERIE' },
};
const TYPE_ORDER = Object.keys(TYPE_DEFS);
const TYPES_VALIDES = TYPE_ORDER;

// Sous-types valides par type, pour les items où le PDF distingue deux variantes
// avec des checks différents (une optique fixe n'a pas les mêmes checks qu'un zoom).
const SOUS_TYPES_VALIDES = {
  OPTIQUE: ['FIXE', 'ZOOM'],
  MATTEBOX: ['CLIPON', 'STANDARD'],
};

// Marque un check comme "avancé" : masqué par défaut dans la Checklist (mode
// simple), visible seulement quand le mode "Checklist avancée" est activé.
const adv = (label) => ({ label, avance: true });

// Référentiel des sous-checks qualité par type, repris de la checklist AOA
// (assistants opérateurs·trices associés), allégé des sections "Configurations"
// (trop spécifiques/film) mais gardé complet sur le reste à la demande de l'utilisateur.
const TYPE_REFERENTIEL = {
  ENERGIE: [
    'Nombre & type de batteries disponibles',
    'État général extérieur des batteries',
    'Test de la tenue et de la durée des batteries',
    'Test des sorties D-Tap & USB sur les batteries',
    'Test des chargeurs',
    'Identification des batteries',
    'Conditionnement & rangement des batteries sur le plateau',
  ],
  CAMERA: [
    adv('Côte caméra (collimateur ou optique de référence)'),
    adv('Colorimétrie de la caméra (boîte à lumière)'),
    'État du capteur : visuel & pixels morts',
    'Test à diaphragme fermé & sensibilité élevée (corrections si nécessaire)',
    'Monture : propreté et serrage',
    adv('Ventilateur : contrôle du bruit'),
    'Reset des menus caméra',
    'Format du capteur : définition (4K, 8K… etc.)',
    'Espace colorimétrique',
    'Format d\'enregistrement : conteneur & codec',
    'Vitesse d\'enregistrement : 24 i/s, 25 i/s… etc.',
    adv('Shutter : 172,8°, 180°… etc.'),
    'Ratio de cadre : 1.85, 2.35, 1.78… etc.',
    'Intégration des framelines',
    adv('Intégration des LUTs + test de compatibilité'),
    adv('Firmware caméra à jour (mise à jour si nécessaire)'),
    'Sorties SDI à harmoniser si besoin (clonage ou sortie « clean »)',
    'Affichage (overlay) avec informations à déterminer',
    'Synchronisation son (timecode)',
    'Alerte du niveau de batterie à configurer',
    'Sauvegarde du Set-up / menu caméra',
    adv('Visée : colorimétrie, luminosité, propreté'),
    'Visée : pivotement, blocage, dioptrie, grossissement',
    'Accroche caméra (loupe longue, déport arrière… etc.)',
    'Boutons assignables (caméra & visée)',
    'Œilleton',
    adv('Vérification de la côte caméra'),
    adv('Conformité de cadre'),
    adv('Grilles de distorsion si besoin'),
  ],
  OPTIQUE: {
    shared: [
      adv('Graduations des deux côtés avec la même unité (impériale)'),
      'Fixation de la monture',
      'Déplacement des bagues (Point, Diaphragme, Zoom)',
      'État des frontales & lentilles arrière',
      adv('Définition'),
      adv('Aberrations & déformations'),
      adv('Flare'),
      'Boîte à lumière : vérification de colorimétrie',
      adv('Noter le numéro de série de l\'optique'),
      adv('Feuille d\'état (frontales & lentilles arrière) à remettre au loueur et garder une copie'),
    ],
    FIXE: [
      'Calage optique',
      'Infini à vérifier',
    ],
    ZOOM: [
      'Calage optique',
      'Infini à vérifier',
      adv('Tracking : tenue de l\'axe optique'),
      adv('Ramping : ouverture constante quelle que soit la focale'),
      adv('Pompage'),
      adv('Correspondance du zoom avec les focales fixes'),
    ],
  },
  DOUBLEUR: [
    'Vérification avec chaque optique',
    'Vérification de la conversion des focales',
    'Compensation de diaphragme',
  ],
  FILTRES: [
    'État des filtres',
    adv('Couleurs des filtres (table lumineuse)'),
    adv('ND : vérification à la boîte à lumière (couleur réelle)'),
    adv('POLA : vérification de la compensation du diaphragme'),
    adv('Diffusion : vérification de la netteté / point'),
    'Identification de chaque filtre : étiquette de tranche & velcro',
    'Rangement des filtres : caisse & pochettes',
    adv('Pochettes vides supplémentaires'),
    adv('Feuille d\'état des filtres à remettre au loueur et garder une copie'),
  ],
  DIOPTRIES: [
    'État des dioptries',
    'Support pour dioptries dans la mattebox',
    'Test de chaque dioptrie dans son support',
    'Rangement des dioptries (pochettes, caisse)',
    'Feuille d\'état des dioptries à remettre au loueur et garder une copie',
  ],
  MATTEBOX: {
    shared: [],
    CLIPON: [
      'État physique : vis, tiroirs & dos',
      'Dos pour chaque optique avec identification',
      'Vignettage optiques',
      'Vignettage caches',
      'Test de tous les tiroirs avec les filtres',
      'Sécurisation des filtres sous le clip-on',
      'Test des volets : supérieur, latéraux (et inférieur si besoin)',
      'Création de volets latéraux si besoin',
      'Présence & test d\'éléments annexes (support tiges, tiroir dioptries, inclinaison)',
      'Détachage et pose de velcro sur l\'auge si besoin',
    ],
    STANDARD: [
      'État physique : vis, tiroirs',
      'Soufflet pour chaque optique et support rond pour filtre',
      'Longueurs de tiges',
      'Vignettage optiques',
      'Vignettage caches',
      'Test de tous les tiroirs avec les filtres',
      'Test des dégradés avec la crémaillère (crantage)',
      'Réducteurs de tiroirs 6.6x6.6 en 4x5.6 si besoin + test',
      'Test des volets : supérieur, latéraux (et inférieur si besoin)',
      'Inclinaison de la mattebox',
      'Pose du velcro',
    ],
  },
  COMMANDE_HF: [
    'Émetteur/moteur RF : fixation & alimentation',
    'Émetteur/moteur RF : antenne',
    'Émetteur/moteur RF : câbles (longueur et types) + spare',
    'Moteurs : nombre et types',
    'Moteurs : pignons',
    'Moteurs : câbles + fixations sur tiges (brackets & réducteurs) + spare',
    'Commande 3 voies : état général',
    'Commande 3 voies : communication avec l\'émetteur (canal & région)',
    'Commande 3 voies : portée',
    'Commande 3 voies : déclenchement du Rec à distance',
    'Commande 3 voies : réglages des paramètres moteurs (torque & direction)',
    'Commande 3 voies : graver les bagues pour le point pour chaque optique & protéger',
    'Commande 3 voies : création/insertion des LDA + test avec chaque optique',
    'Commande 3 voies : test avec les bagues prémarquées + sauvegarde des LDA',
    'Commande 3 voies : assignables des boutons + accroche/dragonne',
    'Commande 1 voie : état général & communication avec l\'émetteur',
    'Commande 1 voie : portée',
    'Commande 1 voie : graver les bagues pour les diaphragmes & protéger',
    'Commande 1 voie : accroche/dragonne & utilisation plateau',
    'Poignée de zoom : état général & communication avec l\'émetteur/moteur',
    'Poignée de zoom : portée & test avec 3 moteurs actifs',
    'Poignée de zoom : direction & vitesse du zoom, dérive à contrôler',
    'Poignée de zoom : ZAP (butées) & assignables',
    'Poignée de zoom : accroche sur manche & poignée',
  ],
  EPAULE: [
    'Crosse épaule',
    'Poignées classiques : état général, serrages & fixations',
    'Poignées motorisées (Master Grip) : état général, serrages & fixations',
    'Poignées motorisées : vérification de l\'électronique embarquée (test & compatibilité)',
    'Test des poignées',
  ],
  ULTRASON: [
    'Alimentation',
    'Configuration sur la caméra',
    'Calibration / Sensibilité / Angle',
    'Extensions des jumelles',
    'Spare & test des câbles (alimentation & connexion aux jumelles)',
    'Communication avec la commande HF',
    'Test des accessoires annexes',
  ],
  FOLLOW_FOCUS: [
    'Vérification des éléments présents (flexible, coude, pont 15/19)',
    'Tiges 15 / 19',
    'Pignon adapté aux optiques',
    'Jeu du follow focus',
    'Vérification de la longueur des tiges nécessaires pour chaque optique',
    'Test avec toutes les optiques (du minimum de point à l\'infini)',
    'Test en configuration avec mattebox (du minimum de point à l\'infini)',
    'Graver les disques pour chaque optique puis protéger',
    'Disques supplémentaires',
  ],
  VISEUR_CHAMP: [
    'Format du dépoli',
    'Comparaison avec une application de viseur de champ',
    'Clarté & Propreté',
    'Serrage',
    'Rangement, transport et organisation sur le plateau',
  ],
  EASYRIG: [
    'État général de l\'easyrig',
    'Compatibilité avec le poids de la caméra : force de traction (Newtons)',
    'Taille & modèle de gilet adapté à la corpulence de l\'opérateur·trice',
    'Présence d\'éléments complémentaires (serene, clé de serrage, lanière, sac)',
    'Test avec la caméra : réglage de la force de traction (si modèle vario)',
    'Test avec la caméra : réglage de la hauteur de la potence',
    'Test avec la caméra : réglage de l\'emplacement du fil + identification',
    'Test avec la caméra : type d\'accroche choisi (classique, anneau + krong)',
    'Rangement & transport',
  ],
  VIDEO_HF: [
    adv('Enregistreur externe : état général'),
    adv('Enregistreur externe : alimentation (support batterie et/ou câbles)'),
    adv('Enregistreur externe : entrées & sorties vidéo'),
    adv('Enregistreur externe : format d\'enregistrement (conteneur & codec) & vitesse'),
    adv('Enregistreur externe : test d\'enregistrement + relecture (vitesse, x2, arrière…)'),
    adv('Enregistreur externe : test du déclenchement automatique'),
    adv('Enregistreur externe : enregistrement du son + arborescence des rushs'),
    adv('Enregistreur externe : gestion des supports (quantité et sauvegarde si besoin)'),
    'Moniteurs : état général & alimentation',
    'Moniteurs : entrées & sorties vidéo',
    'Moniteurs : étalonnage (noter les réglages)',
    'Moniteurs : comparaison des écrans & corrections manuelles si besoin',
    'Moniteurs : comparaison avec la visée caméra',
    'Moniteurs : raccourcis & assignables',
    'Moniteurs : marker / framelines (internes ou permacel)',
    adv('Moniteurs : feuille d\'état à remettre au loueur et garder une copie'),
    'Liaison HF : état général émetteur & récepteurs, appairage',
    'Liaison HF : entrées & sorties vidéo sur émetteur et récepteurs',
    'Liaison HF : vérification d\'image (qualité, latence) & portée',
    'Liaison Wifi : appairage & entrées SDI',
    'Liaison Wifi : vérification de fonctionnement & portée',
    'Liaison Wifi : notice explicative pour l\'équipe à rédiger',
  ],
  DATA: [
    'Médias : nombre disponible & état extérieur des supports',
    'Médias : essais d\'enregistrement et de relecture pour chaque média',
    'Médias : enregistrement maximal sur un média & identification',
    'Ordinateur : état extérieur et connectiques disponibles',
    'Ordinateur : vérification des caractéristiques hardware',
    'Ordinateur : logiciels disponibles (licences actives, firmwares)',
    'Ordinateur : configuration du logiciel de transfert + test du lecteur',
    'Disques durs : nombre disponible & capacités de stockage',
    'Disques durs : connectiques disponibles (navettes & tour Raid)',
    'Disques durs : formatage des disques navettes',
    'Disques durs : tour Raid (capacité de stockage, mode de formatage)',
    'Disques durs : vérification des vitesses de lecture/écriture',
    'Disques durs : test de copie d\'un clip et d\'un média plein sur tous les supports',
    'Disques durs : spare & test des câbles',
  ],
  LUMIERE: [
    'Brancher chaque source et vérifier son bon fonctionnement (allumage, intensité, gradation)',
  ],
  PROLONGS: [
    'Brancher et vérifier qu\'il n\'y a pas de faux contact',
  ],
  TETE_MACHINERIE: [
    'État général de la tête',
    'Réglages de la tête : fluidité, frictions, balance, serrage, bulle',
    'Serrage de la queue d\'aronde / sabot',
    'Éléments présents : manches & contremanches',
    'Adaptation bol 120 ou griffe 300',
    'Présence & installation de HeadLock',
    'Branches : serrage, écartement, fixation de la tête, triangle',
    'Base : type (rectangulaire, triangulaire) & serrage',
  ],
  STABILISATEUR: [
    'Photo de la caisse ouverte pour rangement',
    'État général de la nacelle et des moteurs',
    'Câbles fournis et accessoires listés (si différents loueurs)',
    adv('Test de l\'équilibrage caméra avec chaque objectif'),
    'Câblage du stabilisateur + spare & test des câbles',
    adv('Configuration ordinateur, iPhone, iPad (bluetooth, wifi…)'),
    adv('Réglages de la télécommande de direction (raccourcis, direction des commandes)'),
    adv('Réglages en configuration « portage »'),
    'Test complet avec déambulation/déplacement',
    adv('Test de la durée des batteries (caméra, stabilisateur, commande de direction)'),
    adv('Test des entrées & sorties des écrans/moniteurs intégrés'),
  ],
  ROULANTES: [
    'État général & état des freins',
    'Test du support QRP',
    'Présence & test du support pour branches',
    'Gonflage des pneus',
    'Parapluies & bâches',
  ],
};

// ===========================================================================
// Normalisation des données produites par l'IA
// ===========================================================================
//
// Le prompt d'import demande à l'IA de recopier les tokens `categorie` et
// `type` à l'identique. Sur les trois modèles testés (Gemini, Claude, ChatGPT)
// un seul le fait spontanément à la lettre : les autres écrivent « corps
// caméra » au lieu de « CAMERA », « objectif » au lieu de « OPTIQUE ».
// Ces fonctions rattrapent ces écarts côté serveur, pour que la qualité de
// l'inventaire ne dépende pas de la discipline du modèle utilisé.

/** Minuscules sans accents, pour comparer du texte écrit par une IA. */
const stripAccents = (s) => (s || '')
  .toString()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim();

/**
 * Synonymes acceptés pour chaque `type`.
 *
 * Ils sont comparés en frontière de mot (voir `buildAliasMatchers`), donc
 * « light » ne peut pas être trouvé à l'intérieur de « lightweight ».
 */
const TYPE_ALIASES = {
  ENERGIE: ['energie', 'batterie', 'accu', 'chargeur', 'battery', 'power', 'v-mount', 'v mount', 'gold mount', 'b-mount', 'bloc secteur'],
  CAMERA: ['camera', 'corps camera', 'corps nu', 'boitier', 'body'],
  OPTIQUE: ['optique', 'objectif', 'lens', 'lentille', 'focale', 'zoom', 'serie optique'],
  DOUBLEUR: ['doubleur', 'extendeur', 'extender', 'teleconvertisseur', 'multiplicateur'],
  FILTRES: ['filtre', 'filter', 'nd', 'pola', 'polarisant'],
  DIOPTRIES: ['dioptrie', 'bonnette'],
  MATTEBOX: ['mattebox', 'matte box', 'matt box', 'pare-soleil', 'pare soleil'],
  COMMANDE_HF: ['commande hf', 'commande de point', 'follow focus sans fil', 'wireless follow focus', 'preston', 'cmotion', 'c-motion', 'nucleus', 'wcu', 'hi5'],
  EPAULE: ['epaule', 'crosse epaule', 'crosse', 'shoulder', 'master grip', 'poignee'],
  ULTRASON: ['ultrason', 'ultrasonic', 'cinetape'],
  FOLLOW_FOCUS: ['follow focus', 'demultiplicateur'],
  VISEUR_CHAMP: ['viseur de champ', 'viseur champ', 'directors finder', 'director finder', 'artemis'],
  EASYRIG: ['easyrig', 'easy rig', 'flowcine', 'serene'],
  VIDEO_HF: ['video hf', 'liaison video', 'moniteur', 'combo', 'ecran', 'transmetteur video', 'emetteur video', 'recepteur video', 'enregistreur externe', 'enregistreur video', 'teradek', 'bolt'],
  DATA: ['data', 'carte memoire', 'carte sd', 'carte cfexpress', 'cfast', 'sxs', 'disque dur', 'ssd', 'ordinateur', 'station de sauvegarde', 'lecteur de carte'],
  LUMIERE: ['lumiere', 'source lumineuse', 'projecteur', 'light', 'mandarine', 'blonde', 'fresnel', 'panneau led'],
  PROLONGS: ['prolong', 'rallonge', 'multiprise', 'enrouleur'],
  TETE_MACHINERIE: ['tete machinerie', 'tete fluide', 'tete video', 'pied camera', 'trepied', 'branches', 'base de pied', 'bol 100', 'bol 150'],
  STABILISATEUR: ['stabilisateur', 'gimbal', 'steadicam', 'ronin', 'movi'],
  ROULANTES: ['roulantes', 'roulante', 'dolly', 'chariot'],
};

/**
 * Compile chaque alias en expression régulière à frontières de mot.
 *
 * Le `s?` final accepte le pluriel français courant (« batteries » pour
 * l'alias « batterie ») sans autoriser un match au milieu d'un autre mot.
 */
function buildAliasMatchers(aliases) {
  return aliases.map((alias) => ({
    alias,
    re: new RegExp(`(?<![a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?(?![a-z0-9])`),
  }));
}
const TYPE_MATCHERS = Object.fromEntries(
  Object.entries(TYPE_ALIASES).map(([type, aliases]) => [type, buildAliasMatchers(aliases)])
);

/**
 * Cherche le type dont le mot-clé apparaît le plus tôt dans le texte.
 *
 * Règle voulue : en cas d'ambiguïté, le premier mot-clé rencontré gagne. Un
 * « panneau lumineux avec écran de contrôle » reste donc LUMIERE (« lumineux »
 * avant « écran ») et ne bascule pas en VIDEO_HF.
 *
 * @param {string} texte Texte déjà passé par `stripAccents`.
 * @returns {string} Un type valide, ou '' si aucun ne correspond.
 */
function matchTypeInText(texte) {
  if (!texte) return '';
  let best = null;
  for (const [type, matchers] of Object.entries(TYPE_MATCHERS)) {
    for (const { re } of matchers) {
      const found = texte.match(re);
      if (!found) continue;
      if (!best || found.index < best.index) best = { type, index: found.index };
    }
  }
  return best ? best.type : '';
}

/**
 * Ramène la valeur `type` produite par l'IA sur un token valide.
 *
 * Ordre de résolution :
 *  1. Le token exact (« CAMERA ») est toujours prioritaire.
 *  2. Sinon, on cherche un synonyme dans la valeur fournie.
 *  3. Sinon — et seulement si l'IA avait écrit quelque chose — on cherche un
 *     synonyme dans la désignation de l'item.
 *
 * Le point 3 ne s'applique pas quand l'IA a explicitement répondu `null` :
 * le prompt lui demande de le faire pour les câbles, consommables et petits
 * accessoires, et cette absence de type est un choix légitime qu'il ne faut
 * pas contredire (l'item reste en Inventaire, sans phase de vérification).
 *
 * @param {*} raw Valeur `type` fournie par l'IA.
 * @param {string} [designation] Désignation de l'item, utilisée en dernier recours.
 * @returns {string} Un type valide, ou '' si aucun ne correspond.
 */
function normalizeType(raw, designation = '') {
  const brut = raw == null ? '' : String(raw).trim();
  if (!brut) return '';

  const token = brut.toUpperCase();
  if (TYPE_DEFS[token]) return token;

  const parType = matchTypeInText(stripAccents(brut));
  if (parType) return parType;

  return matchTypeInText(stripAccents(designation));
}

/**
 * Détermine la catégorie d'inventaire d'un item.
 *
 * Quand le type est reconnu, il fait autorité : chaque type appartient par
 * conception à une catégorie et une seule (`TYPE_DEFS[...].categorie`). Cela
 * évite l'incohérence la plus visible côté utilisateur — un item rangé dans
 * ACCESSOIRE dans l'Inventaire mais présent dans la phase Caméra de la
 * Checklist, simplement parce que l'IA avait hésité entre les deux champs.
 *
 * Sans type reconnu, on retient la catégorie fournie si elle est valide
 * (c'est le cas notamment d'AUDIO, qui n'a volontairement aucun type associé),
 * et ACCESSOIRE en dernier recours.
 *
 * @param {*} raw Valeur `categorie` fournie par l'IA.
 * @param {string} [type] Type déjà normalisé.
 */
function normalizeCategorie(raw, type = '') {
  if (type && TYPE_DEFS[type]) return TYPE_DEFS[type].categorie;
  const token = String(raw || '').trim().toUpperCase();
  return CATEGORIES_VALIDES.includes(token) ? token : 'ACCESSOIRE';
}

/** Indices de désignation permettant de deviner un sous-type non fourni. */
const SOUS_TYPE_INDICES = {
  OPTIQUE: [
    // Une plage de focales (« 24-70 », « 17,5-75 mm ») ou le mot zoom.
    { valeur: 'ZOOM', re: /(?<![a-z0-9])zooms?(?![a-z0-9])|\d+[.,]?\d*\s*-\s*\d+[.,]?\d*\s*mm/ },
    // Une focale unique (« 50mm », « 32 mm ») ou le mot fixe/prime.
    { valeur: 'FIXE', re: /(?<![a-z0-9])(fixes?|primes?)(?![a-z0-9])|(?<![-\d])\d+[.,]?\d*\s*mm/ },
  ],
  MATTEBOX: [
    { valeur: 'CLIPON', re: /(?<![a-z0-9])clip[\s-]?ons?(?![a-z0-9])/ },
  ],
};

/**
 * Valide le sous-type, ou le déduit de la désignation s'il est absent.
 *
 * Le sous-type change les checks attribués (une optique fixe n'a ni tracking
 * ni ramping), il vaut donc la peine de le retrouver quand l'IA l'a oublié.
 * En cas de doute on renvoie '' : l'item reçoit alors uniquement les checks
 * communs au type, ce qui est préférable à un mauvais jeu de checks.
 *
 * @param {string} type Type déjà normalisé.
 * @param {*} sousType Valeur `sous_type` fournie par l'IA.
 * @param {string} [designation] Désignation, utilisée si `sousType` est absent.
 */
function sanitizeSousType(type, sousType, designation = '') {
  const valides = SOUS_TYPES_VALIDES[type];
  if (!valides) return '';

  const token = String(sousType || '').trim().toUpperCase();
  if (valides.includes(token)) return token;

  const indices = SOUS_TYPE_INDICES[type];
  if (!indices) return '';
  const texte = stripAccents(designation);
  for (const { valeur, re } of indices) {
    if (re.test(texte)) return valeur;
  }
  return '';
}

/** Quantité maximale acceptée sur une ligne d'inventaire (garde-fou import). */
const QUANTITE_MAX = 500;
/** Nombre maximal de corps caméra éclatés depuis une seule ligne groupée. */
const CAMERAS_MAX = 30;

/**
 * Convertit en entier la quantité fournie par l'IA, quelle que soit sa forme.
 *
 * Accepte les nombres, les chaînes numériques et les formes courantes des
 * listes loueur (« 2 », « x2 », « 2 u. »). Toute valeur inexploitable retombe
 * sur 1, et le résultat est borné : un JSON malformé annonçant une quantité
 * absurde ne doit pas pouvoir faire créer des dizaines de milliers de lignes.
 */
function normalizeQuantite(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(QUANTITE_MAX, Math.max(1, Math.trunc(raw)));
  }
  const found = String(raw ?? '').match(/\d+/);
  const n = found ? parseInt(found[0], 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(QUANTITE_MAX, n);
}

/** Normalise un check du référentiel : chaîne simple ou objet `adv()`. */
const normalizeCheck = (c) => (typeof c === 'string' ? { label: c, avance: false } : c);

/**
 * Renvoie les checks qualité à attribuer à un item.
 *
 * Pour les types à sous-type, on concatène les checks communs (`shared`) et
 * ceux propres à la variante. Un sous-type absent ne donne que les communs.
 *
 * @returns {Array<{label: string, avance: boolean}>}
 */
function getTypeChecks(type, sousType) {
  const ref = TYPE_REFERENTIEL[type];
  if (!ref) return [];
  const brut = Array.isArray(ref) ? ref : [...(ref.shared || []), ...(ref[sousType] || [])];
  return brut.map(normalizeCheck);
}

/**
 * Ensemble de tous les libellés de checks marqués « avancé » dans le
 * référentiel, tous types confondus. Sert à resynchroniser les bases déjà
 * remplies quand un check bascule en avancé (voir `schema.js`).
 */
function advancedCheckLabels() {
  const labels = new Set();
  const collect = (liste) => {
    for (const c of liste) {
      const check = normalizeCheck(c);
      if (check.avance) labels.add(check.label);
    }
  };
  for (const ref of Object.values(TYPE_REFERENTIEL)) {
    if (Array.isArray(ref)) collect(ref);
    else for (const liste of Object.values(ref)) collect(liste);
  }
  return [...labels];
}


// ===========================================================================
// Lots facturés en double (« COMBO »)
// ===========================================================================
//
// Les bons de préparation des loueurs présentent souvent le matériel en
// arborescence : une ligne « lot » suivie de ses composants indentés.
//
//     5   Sony FX6 COMBO                        <- le lot facturé
//         5   Sony FX6 Camescope 4K Corp Nu     <- le vrai corps caméra
//         5   Sony FX6 / FX9 Viseur View Finder
//         5   Adaptateur d'Alim Sony AC
//
// Une fois le document aplati en JSON, l'indentation a disparu : une IA
// compte alors 5 « FX6 COMBO » PLUS 5 corps caméra, soit 10 caméras là où il
// n'y en a que 5. Le prompt d'import explique la règle, mais on ne peut pas
// compter uniquement sur la discipline du modèle.
//
// Ce filet de sécurité repère les lignes de lot dont TOUS les mots
// significatifs se retrouvent dans une autre ligne de même quantité — signe
// que le composant principal du lot est déjà listé séparément.
//
// Il ne supprime jamais rien : la ligne reste visible dans l'Inventaire, elle
// perd seulement son `type`, ce qui l'empêche de créer une phase de Checklist
// et un doublon de caméra. Rien n'est donc perdu silencieusement.
//
// La condition « tous les mots significatifs » est volontairement stricte,
// pour ne jamais neutraliser un vrai matériel :
//   - « Godox FL-100 COMBO » n'a pour sous-ligne qu'une télécommande, qui ne
//     contient pas « fl100 » : le projecteur est conservé.
//   - « DJI RONIN RS 4 PRO COMBO » n'a aucune sous-ligne : il est conservé.

/** Mots trop courants pour distinguer un matériel d'un autre. */
const MOTS_NON_DISTINCTIFS = new Set([
  'combo', 'kit', 'ensemble', 'lot', 'set', 'pack', 'complet', 'avec', 'pour',
  'des', 'les', 'une', 'sur', 'par', 'aux',
]);

/** Réduit un texte à ses seuls caractères alphanumériques, sans accents. */
const compacter = (s) => stripAccents(s).replace(/[^a-z0-9]/g, '');

/** Mots significatifs d'une désignation (≥ 3 caractères, hors mots courants). */
function motsSignificatifs(designation) {
  return stripAccents(designation)
    .split(/[^a-z0-9]+/)
    .filter((mot) => mot.length >= 3 && !MOTS_NON_DISTINCTIFS.has(mot));
}

/**
 * Repère les lignes de lot dont le contenu est déjà listé ailleurs.
 *
 * @param {Array<{designation: string, quantite: number}>} items Liste importée.
 * @returns {Set<number>} Indices des lignes à neutraliser.
 */
function detecterLotsRedondants(items) {
  const redondants = new Set();
  const compacts = items.map((it) => compacter(it.designation));

  items.forEach((item, i) => {
    if (!/(?<![a-z0-9])combo(?![a-z0-9])/.test(stripAccents(item.designation))) return;

    const mots = motsSignificatifs(item.designation);
    if (!mots.length) return;

    const trouve = items.some((autre, j) =>
      j !== i
      && autre.quantite === item.quantite
      && mots.every((mot) => compacts[j].includes(mot))
    );
    if (trouve) redondants.add(i);
  });

  return redondants;
}

module.exports = {
  CATEGORIES_VALIDES,
  TYPE_DEFS,
  TYPE_ORDER,
  TYPES_VALIDES,
  SOUS_TYPES_VALIDES,
  TYPE_REFERENTIEL,
  QUANTITE_MAX,
  CAMERAS_MAX,
  stripAccents,
  normalizeType,
  normalizeCategorie,
  sanitizeSousType,
  normalizeQuantite,
  getTypeChecks,
  advancedCheckLabels,
  detecterLotsRedondants,
  motsSignificatifs,
};
