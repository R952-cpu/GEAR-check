'use strict';
/**
 * Inventaire, phases de vérification et checks qualité.
 *
 * C'est le cœur de l'app, et la route la plus sollicitée : chaque case cochée
 * sur le téléphone provoque un rechargement complet de la checklist. Les
 * lectures sont donc écrites pour tenir en un nombre fixe de requêtes, quel
 * que soit le nombre d'items.
 */
const { dbAll, dbGet, dbRun, withTransaction, runMany, groupBy } = require('../db');
const { createRouter, HttpError } = require('../middleware');
const { uuid, now } = require('./projects');
const {
  TYPE_DEFS, TYPE_ORDER, CAMERAS_MAX,
  normalizeType, normalizeCategorie, sanitizeSousType, normalizeQuantite,
  getTypeChecks, detecterLotsRedondants,
} = require('../referentiel');

const router = createRouter();

const COLONNES_ITEM = `id, project_id, designation, quantite, reference, categorie, type, sous_type,
  emplacement, identifiant, presence_cochee, ordre, phase_id, camera_profile_id`;

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Renvoie la checklist complète d'un projet : phases, items, checks et notes.
 *
 * Cette route remplace un motif « une requête par item » qui coûtait deux
 * requêtes supplémentaires pour chacun des items du projet — plus de deux
 * cents requêtes sur une prépa réelle, rejouées à chaque case cochée. Les
 * enfants sont désormais lus en une seule passe puis regroupés en mémoire :
 * quatre requêtes au total, que le projet contienne dix items ou mille.
 */
router.get('/api/projects/:id/checklist', async (req, res) => {
  const projectId = req.params.id;

  const [phases, items, checks, notes] = await Promise.all([
    dbAll('SELECT * FROM checklist_phases WHERE project_id=? ORDER BY ordre', [projectId]),
    dbAll('SELECT * FROM checklist_items WHERE project_id=? ORDER BY ordre', [projectId]),
    dbAll(`SELECT c.* FROM checklist_checks c
           JOIN checklist_items i ON i.id = c.item_id
           WHERE i.project_id = ? ORDER BY c.item_id, c.ordre`, [projectId]),
    dbAll(`SELECT n.* FROM checklist_notes n
           JOIN checklist_items i ON i.id = n.item_id
           WHERE i.project_id = ? ORDER BY n.item_id, n.created_at`, [projectId]),
  ]);

  const checksParItem = groupBy(checks, 'item_id');
  const notesParItem = groupBy(notes, 'item_id');
  for (const item of items) {
    item.checks = checksParItem.get(item.id) || [];
    item.notes = notesParItem.get(item.id) || [];
  }

  res.json({ phases, items });
});

// ---------------------------------------------------------------------------
// Nouvelle passe de prépa
// ---------------------------------------------------------------------------

/**
 * Décoche la présence et les checks qualité sans rien supprimer.
 *
 * Utile en TV, où le même matériel est revérifié à plusieurs dates : items,
 * phases, identifiants et profils de réglages restent intacts.
 */
router.post('/api/projects/:id/checklist/reset-all', async (req, res) => {
  const projectId = req.params.id;
  const prepa_date = now();
  await withTransaction(async () => {
    await dbRun('UPDATE checklist_items SET presence_cochee=0 WHERE project_id=?', [projectId]);
    await dbRun(`UPDATE checklist_checks SET done=0
                 WHERE item_id IN (SELECT id FROM checklist_items WHERE project_id=?)`, [projectId]);
    await dbRun('UPDATE projects SET prepa_date=? WHERE id=?', [prepa_date, projectId]);
  });
  res.json({ ok: true, prepa_date });
});

// ---------------------------------------------------------------------------
// Import du JSON généré par l'IA
// ---------------------------------------------------------------------------

/** Nombre maximal de lignes acceptées dans un import (garde-fou mémoire). */
const IMPORT_MAX_LIGNES = 3000;
/**
 * Nombre maximal d'items réellement créés par un import.
 *
 * Les lignes de type CAMERA sont éclatées en un item par corps physique : une
 * liste hostile faite de milliers de lignes caméra à forte quantité pourrait
 * donc générer des centaines de milliers de lignes et leurs checks, saturant
 * la base et le disque. Cette borne arrête l'import bien avant.
 */
const IMPORT_MAX_ITEMS = 5000;

/**
 * Remplace intégralement l'inventaire et les phases du projet.
 *
 * Déroulé :
 *  1. Validation stricte du JSON reçu.
 *  2. Normalisation de chaque ligne (type, catégorie, sous-type, quantité).
 *  3. Neutralisation des lignes de lot déjà détaillées ailleurs, pour ne pas
 *     compter deux fois le même matériel physique.
 *  4. Écriture en une seule transaction.
 *
 * Le point 4 est ce qui rend l'import instantané : sans transaction, chacune
 * des milliers d'écritures déclenchait sa propre synchronisation disque sur le
 * SSD externe. Les phases, items et checks sont de plus insérés par lots avec
 * une requête préparée réutilisée.
 */
router.post('/api/projects/:id/checklist/import', async (req, res) => {
  const projectId = req.params.id;
  const liste = req.body.items;

  if (!Array.isArray(liste) || !liste.length) {
    throw new HttpError(400, 'JSON invalide : un tableau non vide est attendu');
  }
  if (liste.length > IMPORT_MAX_LIGNES) {
    throw new HttpError(400, `JSON trop volumineux : ${liste.length} lignes (maximum ${IMPORT_MAX_LIGNES})`);
  }
  for (const ligne of liste) {
    if (!ligne || typeof ligne.designation !== 'string' || !ligne.designation.trim()) {
      throw new HttpError(400, 'Chaque item doit avoir une "designation" non vide');
    }
  }

  // --- Normalisation ------------------------------------------------------
  const normalises = liste.map((ligne) => {
    const designation = ligne.designation.trim().slice(0, 300);
    const type = normalizeType(ligne.type, designation);
    return {
      designation,
      quantite: normalizeQuantite(ligne.quantite),
      reference: String(ligne.reference ?? '').trim().slice(0, 120),
      emplacement: String(ligne.emplacement ?? '').trim().slice(0, 120),
      type,
      categorie: normalizeCategorie(ligne.categorie, type),
      sousType: sanitizeSousType(type, ligne.sous_type, designation),
    };
  });

  // --- Lots facturés en double -------------------------------------------
  const lotsRedondants = detecterLotsRedondants(normalises);
  for (const i of lotsRedondants) {
    normalises[i].type = '';
    normalises[i].sousType = '';
    normalises[i].categorie = 'ACCESSOIRE';
  }

  // --- Construction des lignes à écrire -----------------------------------
  const phases = [];
  const phaseIdParType = new Map();
  const items = [];
  const checks = [];
  let ordreItem = 0;

  const phasePourType = (type) => {
    if (!type) return '';
    let phaseId = phaseIdParType.get(type);
    if (!phaseId) {
      const def = TYPE_DEFS[type];
      phaseId = uuid();
      phaseIdParType.set(type, phaseId);
      phases.push([phaseId, projectId, type, def.label, def.sub, TYPE_ORDER.indexOf(type), 0]);
    }
    return phaseId;
  };

  const ajouterItem = (designation, quantite, source) => {
    const id = uuid();
    const phaseId = phasePourType(source.type);
    items.push([
      id, projectId, designation, quantite, source.reference, source.categorie,
      source.type, source.sousType, source.emplacement, '', 0, ordreItem++, phaseId, '',
    ]);
    getTypeChecks(source.type, source.sousType).forEach((check, ordre) => {
      checks.push([uuid(), id, check.label, 0, ordre, check.avance ? 1 : 0]);
    });
  };

  for (const source of normalises) {
    // Une caméra doit toujours pouvoir être suivie individuellement (numéro de
    // série, profil de réglages, défauts propres). Si la source a groupé les
    // corps sur une seule ligne malgré la consigne du prompt, on les éclate.
    if (source.type === 'CAMERA' && source.quantite > 1) {
      const nb = Math.min(source.quantite, CAMERAS_MAX);
      for (let n = 1; n <= nb; n++) ajouterItem(`${source.designation} #${n}`, 1, source);
    } else {
      ajouterItem(source.designation, source.quantite, source);
    }
    if (items.length > IMPORT_MAX_ITEMS) {
      throw new HttpError(400, `Import trop volumineux : plus de ${IMPORT_MAX_ITEMS} elements seraient crees`);
    }
  }

  // --- Écriture -----------------------------------------------------------
  await withTransaction(async () => {
    await dbRun('DELETE FROM checklist_items WHERE project_id=?', [projectId]);
    await dbRun('DELETE FROM checklist_phases WHERE project_id=?', [projectId]);
    await runMany(
      'INSERT INTO checklist_phases (id, project_id, type, label, sub, ordre, custom) VALUES (?,?,?,?,?,?,?)',
      phases
    );
    await runMany(
      `INSERT INTO checklist_items (${COLONNES_ITEM}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      items
    );
    await runMany(
      'INSERT INTO checklist_checks (id, item_id, label, done, ordre, avance) VALUES (?,?,?,?,?,?)',
      checks
    );
  });

  res.json({
    ok: true,
    count: items.length,
    phases: phases.length,
    lots_neutralises: lotsRedondants.size,
  });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Ajout manuel : atterrit en Inventaire seul, sans phase. */
router.post('/api/projects/:id/checklist-items', async (req, res) => {
  const designation = String(req.body.designation || '').trim();
  if (!designation) throw new HttpError(400, 'La designation est obligatoire');

  const id = uuid();
  const { c } = await dbGet('SELECT COUNT(*) AS c FROM checklist_items WHERE project_id=?', [req.params.id]);
  await dbRun(
    `INSERT INTO checklist_items (${COLONNES_ITEM}) VALUES (?,?,?,?,?,?,'','',?,'',0,?,'','')`,
    [id, req.params.id, designation, normalizeQuantite(req.body.quantite),
      req.body.reference || '', normalizeCategorie(req.body.categorie), req.body.emplacement || '', c]
  );
  res.json({ id });
});

router.put('/api/checklist-items/:id', async (req, res) => {
  const { designation, quantite, reference, emplacement, identifiant, presence_cochee } = req.body;
  await dbRun(
    `UPDATE checklist_items
     SET designation=?, quantite=?, reference=?, emplacement=?, identifiant=?, presence_cochee=?
     WHERE id=?`,
    [designation, normalizeQuantite(quantite), reference ?? '', emplacement ?? '',
      identifiant ?? '', presence_cochee ? 1 : 0, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/api/checklist-items/:id', async (req, res) => {
  await dbRun('DELETE FROM checklist_items WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

/**
 * Assigne un item à une phase (ou l'en retire si `phase_id` est vide).
 *
 * Quand la phase d'accueil a un type différent, l'item adopte ce type et
 * reçoit les checks qualité correspondants qui lui manquent : sans cela il
 * apparaîtrait dans la phase sans rien à cocher, donc sans utilité.
 */
router.put('/api/checklist-items/:id/phase', async (req, res) => {
  const phaseId = req.body.phase_id || '';
  const item = await dbGet('SELECT * FROM checklist_items WHERE id=?', [req.params.id]);
  if (!item) throw new HttpError(404, 'Item introuvable');

  await withTransaction(async () => {
    if (phaseId) {
      const phase = await dbGet('SELECT * FROM checklist_phases WHERE id=?', [phaseId]);
      if (phase && phase.type && phase.type !== item.type) {
        const sousType = sanitizeSousType(phase.type, item.sous_type, item.designation);
        await dbRun('UPDATE checklist_items SET type=?, sous_type=? WHERE id=?',
          [phase.type, sousType, req.params.id]);

        const existants = new Set(
          (await dbAll('SELECT label FROM checklist_checks WHERE item_id=?', [req.params.id]))
            .map((c) => c.label)
        );
        const { m } = await dbGet('SELECT COALESCE(MAX(ordre),-1) AS m FROM checklist_checks WHERE item_id=?', [req.params.id]);
        let ordre = m + 1;
        const nouveaux = getTypeChecks(phase.type, sousType)
          .filter((c) => !existants.has(c.label))
          .map((c) => [uuid(), req.params.id, c.label, 0, ordre++, c.avance ? 1 : 0]);
        await runMany('INSERT INTO checklist_checks (id, item_id, label, done, ordre, avance) VALUES (?,?,?,?,?,?)', nouveaux);
      }
    }
    await dbRun('UPDATE checklist_items SET phase_id=? WHERE id=?', [phaseId, req.params.id]);
  });

  res.json({ ok: true });
});

router.put('/api/checklist-items/:id/camera-profile', async (req, res) => {
  await dbRun('UPDATE checklist_items SET camera_profile_id=? WHERE id=?',
    [req.body.camera_profile_id || '', req.params.id]);
  res.json({ ok: true });
});

/** Échange la position de l'item avec son voisin, dans la même phase. */
router.post('/api/checklist-items/:id/move', async (req, res) => {
  const item = await dbGet('SELECT * FROM checklist_items WHERE id=?', [req.params.id]);
  if (!item) throw new HttpError(404, 'Item introuvable');

  const versLeHaut = req.body.direction === 'up';
  const voisin = await dbGet(
    `SELECT * FROM checklist_items
     WHERE project_id=? AND phase_id=? AND ordre ${versLeHaut ? '<' : '>'} ?
     ORDER BY ordre ${versLeHaut ? 'DESC' : 'ASC'} LIMIT 1`,
    [item.project_id, item.phase_id, item.ordre]
  );

  if (voisin) {
    await withTransaction(async () => {
      await dbRun('UPDATE checklist_items SET ordre=? WHERE id=?', [voisin.ordre, item.id]);
      await dbRun('UPDATE checklist_items SET ordre=? WHERE id=?', [item.ordre, voisin.id]);
    });
  }
  res.json({ ok: true });
});

/** Coche ou décoche la présence de tous les items d'une catégorie. */
router.post('/api/projects/:id/checklist/presence-bulk', async (req, res) => {
  await dbRun('UPDATE checklist_items SET presence_cochee=? WHERE project_id=? AND categorie=?',
    [req.body.presence ? 1 : 0, req.params.id, req.body.categorie || '']);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Checks qualité et notes
// ---------------------------------------------------------------------------

router.put('/api/checklist-checks/:id', async (req, res) => {
  await dbRun('UPDATE checklist_checks SET done=? WHERE id=?', [req.body.done ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

/** Ajoute un check personnalisé, en plus de ceux issus du référentiel. */
router.post('/api/checklist-items/:id/checks', async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) throw new HttpError(400, 'Le libelle est obligatoire');
  const id = uuid();
  const { c } = await dbGet('SELECT COUNT(*) AS c FROM checklist_checks WHERE item_id=?', [req.params.id]);
  await dbRun('INSERT INTO checklist_checks (id, item_id, label, done, ordre, avance) VALUES (?,?,?,0,?,0)',
    [id, req.params.id, label, c]);
  res.json({ id });
});

router.delete('/api/checklist-checks/:id', async (req, res) => {
  await dbRun('DELETE FROM checklist_checks WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

/**
 * Coche (ou décoche) d'un coup tous les checks d'un item.
 *
 * Ne touche par défaut qu'aux checks simples : les checks « avancés » ne sont
 * concernés que si le mode Checklist avancée est actif côté client, sinon on
 * validerait en masse des points invisibles à l'écran.
 */
router.post('/api/checklist-items/:id/quick-ok', async (req, res) => {
  const done = req.body.done === false ? 0 : 1;
  await dbRun(
    req.body.include_advanced
      ? 'UPDATE checklist_checks SET done=? WHERE item_id=?'
      : 'UPDATE checklist_checks SET done=? WHERE item_id=? AND avance=0',
    [done, req.params.id]
  );
  res.json({ ok: true });
});

router.post('/api/checklist-items/:id/notes', async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw new HttpError(400, 'Le texte est obligatoire');
  const id = uuid();
  await dbRun('INSERT INTO checklist_notes (id, item_id, text, created_at) VALUES (?,?,?,?)',
    [id, req.params.id, text, now()]);
  res.json({ id });
});

router.delete('/api/checklist-notes/:id', async (req, res) => {
  await dbRun('DELETE FROM checklist_notes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

router.post('/api/projects/:id/checklist-phases/reorder', async (req, res) => {
  const ordre = req.body.order;
  if (!Array.isArray(ordre)) throw new HttpError(400, 'Une liste "order" est attendue');
  await withTransaction(() => runMany(
    'UPDATE checklist_phases SET ordre=? WHERE id=? AND project_id=?',
    ordre.map((phaseId, i) => [i, phaseId, req.params.id])
  ));
  res.json({ ok: true });
});

router.post('/api/projects/:id/checklist-phases', async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) throw new HttpError(400, 'Le nom de la phase est obligatoire');

  const id = uuid();
  const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids : [];
  await withTransaction(async () => {
    const { m } = await dbGet('SELECT COALESCE(MAX(ordre),-1) AS m FROM checklist_phases WHERE project_id=?', [req.params.id]);
    await dbRun(
      "INSERT INTO checklist_phases (id, project_id, type, label, sub, ordre, custom) VALUES (?,?,'',?,?,?,1)",
      [id, req.params.id, label, req.body.sub || '', m + 1]
    );
    await runMany('UPDATE checklist_items SET phase_id=? WHERE id=? AND project_id=?',
      itemIds.map((itemId) => [id, itemId, req.params.id]));
  });
  res.json({ id });
});

router.put('/api/checklist-phases/:id', async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) throw new HttpError(400, 'Le nom de la phase est obligatoire');
  await dbRun('UPDATE checklist_phases SET label=?, sub=? WHERE id=?', [label, req.body.sub || '', req.params.id]);
  res.json({ ok: true });
});

/** Supprime la phase : ses items repartent en Inventaire seul, rien n'est perdu. */
router.delete('/api/checklist-phases/:id', async (req, res) => {
  await withTransaction(async () => {
    await dbRun("UPDATE checklist_items SET phase_id='' WHERE phase_id=?", [req.params.id]);
    await dbRun('DELETE FROM checklist_phases WHERE id=?', [req.params.id]);
  });
  res.json({ ok: true });
});

module.exports = { router };
