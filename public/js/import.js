// ==========================================================================
// Import de l'inventaire depuis une liste loueur.
//
// Contient le prompt à donner à l'IA pour produire le JSON, le parcours guidé
// (copier le prompt, coller le résultat) et l'envoi au serveur.
// ==========================================================================

// ===== CHECKLIST : import IA =====
// Prompt donné à l'IA pour transformer une liste loueur en JSON importable.
//
// Il est écrit autour d'une observation faite sur de vrais bons de préparation :
// un loueur ne fournit pas une liste plate, mais une arborescence — une ligne
// de lot suivie de ses composants indentés. Une fois le PDF lu à plat, cette
// hiérarchie disparaît et le modèle compte deux fois le même matériel.
// La partie ÉTAPE 2 est donc la plus importante du prompt : elle donne le
// critère qui distingue une étiquette de lot d'un vrai matériel.
const CHECKLIST_PROMPT = `Tu es assistant caméra. Tu dois transformer un bon de préparation / une liste de matériel de loueur en un inventaire JSON exploitable pour une prépa caméra en TV.

Réponds UNIQUEMENT par un tableau JSON valide, sans phrase d'introduction, sans commentaire, sans explication.

STRUCTURE DE CHAQUE OBJET :
[
  {
    "designation": "Nom exact de l'équipement, tel qu'écrit dans le document",
    "quantite": 1,
    "reference": "Référence ou code produit s'il figure dans le document, sinon null",
    "categorie": "ENERGIE / CAMERA / OPTIQUE / VIDEO_HF / LUMIERE / MACHINERIE / AUDIO / ACCESSOIRE / DATA",
    "type": "voir la liste plus bas, ou null si aucun ne correspond",
    "sous_type": "seulement pour type=OPTIQUE (FIXE ou ZOOM) et type=MATTEBOX (CLIPON ou STANDARD), sinon null",
    "emplacement": "Flight case, caisse ou lieu si le document le précise, sinon null"
  }
]

===========================================================================
ÉTAPE 1 — LIS LA STRUCTURE DU DOCUMENT AVANT D'EXTRAIRE QUOI QUE CE SOIT
===========================================================================

Un bon de préparation n'est pas une liste plate. Il contient trois choses
différentes qu'il ne faut jamais confondre :

a) EN-TÊTES DE SECTION : une ligne de texte SANS quantité en face
   ("Moyens vidéo", "Moyens Audio", "Groupe d'équipements supplémentaire",
   "Machinerie"...). Ne crée JAMAIS d'item pour ces lignes.

b) LIGNES DE MATÉRIEL : une quantité + un nom.

c) SOUS-LIGNES INDENTÉES sous une ligne de matériel : elles détaillent le
   contenu de la ligne du dessus. L'indentation est le signal le plus
   important du document — repère-la à la fois sur la position du nom ET sur
   la position du chiffre de quantité, qui est lui aussi décalé vers la
   droite.

Si certaines lignes sont barrées (trait de stylo, texte rayé), elles ont été
retirées de la commande : ignore-les complètement.

Les colonnes de droite ("Montant des articles sous-loués", "Remarque
interne") ne sont pas des noms de matériel. Ne les confonds pas avec la
désignation.

===========================================================================
ÉTAPE 2 — POUR CHAQUE LIGNE QUI A DES SOUS-LIGNES, APPLIQUE CE TEST
===========================================================================

C'est la source d'erreur numéro un, celle qui fausse tous les comptages.

Pose-toi une seule question :
« Le matériel PRINCIPAL désigné par la ligne parente se retrouve-t-il parmi
  ses propres sous-lignes ? »

→ OUI : la ligne parente n'est qu'une ÉTIQUETTE DE LOT, une façon de
  facturer un ensemble. Elle ne correspond à aucun objet physique
  supplémentaire.
  Extrais les sous-lignes normalement, et pour la ligne parente mets
  "categorie": "ACCESSOIRE" et "type": null. Elle restera visible dans
  l'inventaire comme rappel du kit, sans être comptée deux fois.

→ NON : les sous-lignes ne sont que des accessoires qui complètent la ligne
  parente. La ligne parente EST le vrai matériel.
  Extrais la ligne parente ET ses sous-lignes, chacune normalement.

Le mot "COMBO" n'est PAS le critère. Beaucoup de loueurs regroupent par
paquets sans jamais écrire ce mot, et certaines lignes qui portent "COMBO"
sont bel et bien du vrai matériel. Ne te fie qu'au test ci-dessus.

EXEMPLES PRIS SUR UN BON DE PRÉPARATION RÉEL :

  5   Sony FX6 COMBO
          5   Sony FX6 Camescope 4K E-mount Corp Nu
          5   Sony FX6 / FX9 Viseur View Finder
          5   Sony FX6 - Moniteur + Support viewfinder
          5   Adaptateur d'Alim Sony AC
          5   Sony FX6 Poignée Top
  Le corps caméra est bien dans les sous-lignes → "Sony FX6 COMBO" est une
  étiquette. Il y a 5 caméras au total, PAS 10.

  4   DJI SDR COMBO
          4   RX DJI SDR Transmission
          4   TX DJI SDR Transmission
  L'émetteur et le récepteur forment à eux deux tout le système → la ligne
  parente est une étiquette. On garde 4 RX et 4 TX, rien de plus.

  5   Crosse épaule COMBO
          5   Shape BP20 Epauliere
          5   Poignée Gauche Shape Crosse Epaule
          5   Poignée Droite Shape Crosse Epaule
  L'épaulière est dans les sous-lignes → la ligne parente est une étiquette.

  5   Objectif Sony FE 24-105 mm F4 G OSS (77mm)
          5   Bouchon avant objectif
          5   Pochette Objectif
          5   Filtre UV de protection
  Aucune sous-ligne n'est l'objectif lui-même, ce sont ses accessoires → la
  ligne parente EST le vrai objectif. On la garde, ET ses sous-lignes.

  3   Godox FL-100 COMBO
          3   Telecommande Godox RC-A5 FL-SF4060
  Le projecteur n'apparaît pas dans les sous-lignes, seulement sa
  télécommande → la ligne parente EST le projecteur. On garde tout.

  1   DJI RONIN RS 4 PRO COMBO
  Aucune sous-ligne → c'est simplement le stabilisateur. On le garde.

===========================================================================
ÉTAPE 3 — QUANTITÉS
===========================================================================

1. La quantité indiquée est TOUJOURS un total, jamais une quantité par kit.
   "5 Sony FX6 COMBO" avec "5 Viseur" en sous-ligne = 5 viseurs au total,
   pas 25.
2. Quantité absente ou illisible → mets 1.
3. Pour type=CAMERA UNIQUEMENT : crée une ligne distincte par corps physique,
   avec "quantite": 1 sur chacune, même si le document écrit "Sony FX6 x5".
   Chaque caméra doit pouvoir être suivie séparément (numéro de série,
   réglages menu, défaut constaté). Pour tous les autres types, une seule
   ligne avec la quantité totale suffit.
4. Un même modèle qui réapparaît plus loin dans le document n'est pas
   forcément du matériel en plus. C'est très souvent le même matériel
   rappelé dans une autre section, ou partagé entre deux caméras. Ne crée
   une ligne supplémentaire que si le document dit explicitement qu'il
   s'agit d'un stock distinct ("de rechange", "jeu supplémentaire",
   "spare"). Dans le doute, ne recompte pas.

===========================================================================
ÉTAPE 4 — RÉFÉRENCES
===========================================================================

1. S'il existe une colonne de référence ou de code produit, recopie-la.
2. S'il n'y en a pas, extrais le code modèle contenu dans le nom quand il est
   clairement identifiable : "Emetteur Sennheiser SK5212" → "SK5212",
   "Moniteur HD Seetec P215-9HSD-CO" → "P215-9HSD-CO".
3. N'INVENTE JAMAIS de référence. Si tu n'es pas sûr, mets null.
4. Ne touche pas à la désignation : recopie-la telle qu'elle est écrite,
   sans traduire ni reformuler les noms techniques.

===========================================================================
ÉTAPE 5 — CLASSEMENT
===========================================================================

Recopie les valeurs de "categorie" et "type" EXACTEMENT comme écrites
ci-dessous : majuscules et underscores compris. Jamais de paraphrase, jamais
de traduction. Écris "CAMERA" et non "corps caméra", "OPTIQUE" et non
"objectif". Si rien ne correspond, mets null — pas une description.

CATÉGORIES :
1. ENERGIE     : batteries (V-Mount, Gold-Mount, NP-F, B-Mount), chargeurs, blocs secteur, stations d'énergie.
2. CAMERA      : boîtiers, corps caméra, accessoires de cage.
3. OPTIQUE     : objectifs fixes et zooms, doubleurs, extendeurs, filtres, dioptries.
4. VIDEO_HF    : transmetteurs et récepteurs HF vidéo, moniteurs de régie, combos et écrans de contrôle, enregistreurs externes.
5. LUMIERE     : projecteurs, sources lumineuses, rallonges électriques, multiprises.
6. MACHINERIE  : pieds et trépieds, têtes, roulantes, stabilisateurs.
7. AUDIO       : micros, bonnettes, émetteurs et récepteurs HF son, casques, enregistreurs son, câbles XLR.
8. ACCESSOIRE  : mattebox, follow focus, commande HF de point, épaule, easyrig, viseur de champ, ultrason, et tout ce qui n'entre nulle part ailleurs.
9. DATA        : cartes et médias d'enregistrement, lecteurs de cartes, disques durs, ordinateur, station de sauvegarde.

TYPES (un type déclenche une phase de vérification dédiée dans l'app) :
- ENERGIE          : batterie, chargeur, bloc secteur
- CAMERA           : corps caméra / boîtier
- OPTIQUE          : objectif — précise sous_type "FIXE" (focale unique) ou "ZOOM" (plage de focales)
- DOUBLEUR         : doubleur, extendeur, téléconvertisseur
- FILTRES          : filtre optique (ND, POLA, diffusion, UV...)
- DIOPTRIES        : dioptrie, bonnette macro
- MATTEBOX         : mattebox, pare-soleil — précise sous_type "CLIPON" ou "STANDARD"
- COMMANDE_HF      : commande de point SANS FIL et ses moteurs (Preston, cmotion, Tilta Nucleus...)
- EPAULE           : crosse épaule, épaulière, poignées
- ULTRASON         : système de mesure de distance à ultrason
- FOLLOW_FOCUS     : follow focus manuel (mécanique, non motorisé)
- VISEUR_CHAMP     : viseur de champ, director's finder
- EASYRIG          : easyrig ou système de portage équivalent
- VIDEO_HF         : moniteur, combo, écran de contrôle, émetteur/récepteur HF vidéo, liaison wifi vidéo, enregistreur externe
- DATA             : carte mémoire, lecteur de carte, disque dur, ordinateur, station de sauvegarde
- LUMIERE          : projecteur, source lumineuse, panneau LED, minette
- PROLONGS         : rallonge électrique, multiprise, enrouleur
- TETE_MACHINERIE  : tête fluide, trépied, branches, base de pied
- STABILISATEUR    : steadicam, gimbal, stabilisateur motorisé
- ROULANTES        : dolly, roulantes, chariot

Mettre "type": null est normal et attendu pour tout ce qui n'a pas de phase
de vérification dédiée : câbles, tiges, supports, bouchons, pochettes,
adaptateurs, pieds de lumière, consommables, et tout le matériel audio.
L'objet reste dans l'inventaire, simplement sans checking qualité associé.

En cas d'ambiguïté entre deux types, choisis celui dont le mot-clé apparaît
en PREMIER dans la désignation. Exemple : un panneau lumineux avec écran de
contrôle intégré reste LUMIERE ("lumineux" avant "écran"), pas VIDEO_HF.

===========================================================================
ÉTAPE 6 — RELIS-TOI AVANT DE RÉPONDRE
===========================================================================

Vérifie point par point, puis produis le JSON :

1. Combien de corps caméra as-tu au total en type=CAMERA ? Ce nombre
   correspond-il au nombre réel de caméras du tournage ? Si tu as à la fois
   une ligne de lot ET la ligne du corps détaillée, tu as compté double.
2. Chaque ligne de lot dont le contenu est détaillé en dessous a-t-elle bien
   "type": null ?
3. Chaque valeur "categorie" et "type" est-elle recopiée exactement depuis
   les listes ci-dessus ?
4. Chaque ligne du document apparaît-elle une fois et une seule ?
5. As-tu inventé une référence qui ne figure pas dans le document ?
6. Aucun en-tête de section ni aucune ligne barrée ne s'est glissé dans le
   résultat ?`;

const CHECKLIST_PHASE_ICONS = {};

function findChecklistItem(id) { return (S.checklist.items || []).find(it => it.id === id); }
function findPhase(id) { return (S.checklist.phases || []).find(p => p.id === id); }

// En mode simple (par défaut), les checks marqués "avancé" (secondaire pour la
// TV — cf. réglages fins optique/caméra/filtres) ne comptent pas dans l'état
// de validation ni dans les badges, tant que "Checklist avancée" n'est pas activé.
function visibleChecks(item) {
  const checks = item.checks || [];
  return S.checklistAdvanced ? checks : checks.filter(c => !c.avance);
}

function itemState(item) {
  if (!item.presence_cochee) return 'missing';
  const checks = visibleChecks(item);
  if (!checks.length) return 'validated';
  return checks.every(c => c.done) ? 'validated' : 'partial';
}

function renderChecklistOnboarding() {
  const step = S.checklistOnboardStep || 'explain';
  return step === 'upload' ? renderOnboardUpload(S.checklistReimporting) : renderOnboardExplain();
}

function renderOnboardExplain() {
  return `
  <div class="card" style="padding:20px">
    <div class="card-title" style="margin-bottom:12px">📋 ${S.checklistReimporting ? 'Réimporte ta checklist' : 'Prépare ta checklist'}</div>
    <p style="font-size:14px;color:var(--text2);line-height:1.75;margin-bottom:16px">
      1. Ouvre <strong style="color:var(--accent)">Gemini</strong> (le plus fiable pour l'instant — les autres respectent moins bien le format demandé).<br>
      2. Dépose ta liste matériel — PDF, ou <strong>photo du bon de préparation</strong> si des lignes sont barrées à la main — et colle le prompt ci-dessous.<br>
      3. Récupère le JSON généré (fichier ou texte).<br>
      4. Reviens ici et importe-le à l'étape suivante.<br>
      <span style="opacity:.75">Le prompt sait lire les lots (« Sony FX6 COMBO » et son détail en dessous) pour ne pas compter deux fois le même matériel.</span>
    </p>
    <div style="background:rgba(0,0,0,0.32);border:1px solid rgba(255,255,255,0.11);border-radius:13px;padding:12px;max-height:220px;overflow-y:auto;margin-bottom:16px">
      <pre style="white-space:pre-wrap;font-size:12px;color:var(--text2);font-family:ui-monospace,monospace;line-height:1.5;margin:0">${esc(CHECKLIST_PROMPT)}</pre>
    </div>
    <button class="btn btn-secondary" style="margin-bottom:10px" onclick="copyChecklistPrompt(this)">📋 Copier le prompt</button>
    ${S.checklistReimporting ? `<button class="btn btn-secondary" style="margin-bottom:10px" onclick="cancelReimport()">Annuler la réimportation</button>` : ''}
    <button class="btn btn-primary" onclick="setOnboardStep('upload')">Suivant</button>
  </div>`;
}
async function copyChecklistPrompt(btn) {
  const ok = await copyToClipboard(CHECKLIST_PROMPT);
  if (ok) {
    showToast('✓ Copié dans le presse-papier');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Copié';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  } else {
    showToast('Copie impossible — sélectionne le texte à la main', true);
  }
}

// Copie robuste : API Clipboard si dispo en contexte sécurisé, sinon repli
// via Range/Selection + execCommand — nécessaire car l'app tourne en http://
// sur le réseau local (pas de contexte sécurisé) et un simple textarea.select()
// hors écran ne se sélectionne pas de façon fiable sur Safari iOS.

function setOnboardStep(step) { S.checklistOnboardStep = step; renderPrepa(); }

function renderOnboardUpload(isReimport) {
  return `
  <div class="card" style="padding:20px">
    <div class="card-title" style="margin-bottom:12px">📥 ${isReimport ? 'Réimporter le JSON' : 'Importer le JSON'}</div>
    <p style="font-size:14px;color:var(--text2);line-height:1.6;margin-bottom:16px">Sélectionne le fichier .json reçu, ou colle directement le texte JSON ci-dessous.</p>
    <div class="form-group"><label class="form-label">Fichier JSON</label><input type="file" id="in-json-file" accept=".json,application/json" class="form-input" style="padding:10px"></div>
    <div class="form-group"><label class="form-label">Ou coller le JSON</label><textarea class="form-input" id="in-json-text" rows="6" placeholder='[{"designation": "Sony FX6", "quantite": 1, "categorie": "CAMERA", "type": "CAMERA", ...}]'></textarea></div>
    <div id="import-error" style="color:var(--red);font-size:13px;margin-bottom:10px;display:none"></div>
    <button class="btn btn-secondary" style="margin-bottom:10px" onclick="${isReimport ? 'cancelReimport()' : "setOnboardStep('explain')"}">${isReimport ? 'Annuler' : '‹ Retour'}</button>
    <button class="btn btn-primary" onclick="importChecklist(this)">Importer</button>
  </div>`;
}
function cancelReimport() { S.checklistReimporting = false; S.checklistOnboardStep = 'explain'; renderPrepa(); }
function confirmReimportChecklist() {
  openSheet(`
    <div class="sheet-title">Réimporter une checklist ?</div>
    <p style="color:var(--text2);font-size:14px;margin-bottom:16px">L'inventaire et toutes les phases (auto ou personnalisées) seront remplacés entièrement par le nouvel import. Cette action est irréversible.</p>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="closeSheet()">Annuler</button>
      <button class="btn btn-danger" onclick="doReimport()">Remplacer</button>
    </div>
  `);
}
function doReimport() {
  closeSheet();
  S.checklistReimporting = true;
  S.checklistOnboardStep = 'explain';
  renderPrepa();
}
async function importChecklist(btn) {
  const errEl = document.getElementById('import-error');
  errEl.style.display = 'none';
  const file = document.getElementById('in-json-file').files[0];
  const text = document.getElementById('in-json-text').value.trim();
  try {
    const raw = file ? await file.text() : text;
    if (!raw) throw new Error('Choisis un fichier ou colle le JSON.');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error("Ce texte n'est pas un JSON valide."); }
    if (!Array.isArray(parsed) || !parsed.length) throw new Error('Le JSON doit être un tableau non vide.');
    if (btn) { btn.disabled = true; btn.textContent = 'Import…'; }
    const res = await api.post(`/api/projects/${S.projectId}/checklist/import`, { items: parsed });
    if (res.error) throw new Error(res.error);
    S.checklistOnboardStep = 'explain';
    S.checklistReimporting = false;
    await reloadChecklist();
  } catch (e) {
    errEl.textContent = e.message || 'JSON invalide.';
    errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.textContent = 'Importer'; }
  }
}

