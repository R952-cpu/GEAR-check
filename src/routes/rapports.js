'use strict';
/**
 * Comptes-rendus de prépa archivés.
 *
 * Ce sont des instantanés figés de l'inventaire et de la checklist au moment
 * où la prépa est déclarée terminée. Le contenu (`data`) est construit et relu
 * côté client : le serveur ne fait que le conserver tel quel, ce qui permet de
 * rouvrir un ancien compte-rendu exactement dans l'état où il a été généré,
 * même si l'inventaire a changé depuis.
 *
 * Chaque compte-rendu porte en plus :
 *  - un `titre` libre, choisi au moment de la génération ;
 *  - un numéro de `version` attribué automatiquement, qui s'incrémente à chaque
 *    nouveau compte-rendu du projet — une prépa s'étale souvent sur plusieurs
 *    jours, et il faut pouvoir distinguer les documents entre eux ;
 *  - une `version_note` facultative précisant la raison de cette version
 *    (« Jour 2 », « Rectificatif »…) ;
 *  - des photos légendées, ajoutées à la génération ou plus tard.
 */
const fs = require('fs');
const path = require('path');
const { dbAll, dbGet, dbRun, withTransaction, runMany, groupBy } = require('../db');
const { createRouter, upload, HttpError } = require('../middleware');
const { uuid, now, supprimerFichiers } = require('./projects');

const router = createRouter();

/** Taille maximale d'un instantané archivé (garde-fou base). */
const SNAPSHOT_MAX_OCTETS = 4 * 1024 * 1024;
/** Nombre maximal de photos par compte-rendu. */
const PHOTOS_MAX = 40;

const LONGUEUR_TITRE = 120;
const LONGUEUR_NOTE = 80;
const LONGUEUR_VERSION = 24;
const LONGUEUR_LEGENDE = 300;

/** Colonnes renvoyées pour une liste : jamais `data`, inutile et volumineux. */
const COLONNES_LISTE = 'id, project_id, label, titre, version, version_label, version_note, created_at';

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Liste des comptes-rendus du projet, du plus récent au plus ancien, avec le
 * nombre de photos de chacun (pour l'afficher sans charger les photos).
 */
router.get('/api/projects/:id/prepa-reports', async (req, res) => {
  const rapports = await dbAll(
    `SELECT ${COLONNES_LISTE} FROM prepa_reports WHERE project_id=? ORDER BY created_at DESC`,
    [req.params.id]
  );
  const comptes = await dbAll(
    `SELECT p.report_id, COUNT(*) AS n FROM prepa_report_photos p
     JOIN prepa_reports r ON r.id = p.report_id
     WHERE r.project_id = ? GROUP BY p.report_id`,
    [req.params.id]
  );
  const parRapport = new Map(comptes.map((c) => [c.report_id, c.n]));
  for (const r of rapports) r.nb_photos = parRapport.get(r.id) || 0;
  res.json(rapports);
});

router.get('/api/prepa-reports/:id', async (req, res) => {
  const rapport = await dbGet('SELECT * FROM prepa_reports WHERE id=?', [req.params.id]);
  if (!rapport) throw new HttpError(404, 'Compte-rendu introuvable');

  // Un instantané corrompu ne doit pas faire échouer la requête : on renvoie un
  // objet vide plutôt qu'une erreur 500 qui bloquerait tout l'onglet.
  try {
    rapport.data = JSON.parse(rapport.data);
  } catch {
    console.warn('[rapports] instantané illisible', rapport.id);
    rapport.data = {};
  }
  rapport.photos = await dbAll(
    'SELECT id, file_path, legende, ordre FROM prepa_report_photos WHERE report_id=? ORDER BY ordre',
    [req.params.id]
  );
  res.json(rapport);
});

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

router.post('/api/projects/:id/prepa-reports', async (req, res) => {
  const data = JSON.stringify(req.body.data || {});
  if (data.length > SNAPSHOT_MAX_OCTETS) {
    throw new HttpError(413, 'Compte-rendu trop volumineux pour etre archive');
  }

  const titre = String(req.body.titre || '').trim().slice(0, LONGUEUR_TITRE);
  const versionNote = String(req.body.version_note || '').trim().slice(0, LONGUEUR_NOTE);
  const saisie = String(req.body.version_label || '').trim().slice(0, LONGUEUR_VERSION);
  const id = uuid();
  const creeLe = now();

  const resultat = await withTransaction(async () => {
    // Le numéro suit le projet, pas la date : deux comptes-rendus générés le
    // même jour restent distincts et ordonnés.
    const { m } = await dbGet(
      'SELECT COALESCE(MAX(version), 0) AS m FROM prepa_reports WHERE project_id=?',
      [req.params.id]
    );
    const suivante = m + 1;

    // La saisie est libre, mais le compteur interne doit rester exploitable :
    //  - un nombre force le numéro, et la suite repart de là ;
    //  - un texte (« Finale », « 3 bis ») est conservé tel quel pour
    //    l'affichage, tandis que le compteur poursuit sa progression normale.
    // `version` reste donc toujours un entier, qui sert à ordonner les
    // documents et à proposer le numéro suivant.
    const forceNombre = /^\d{1,4}$/.test(saisie);
    const version = forceNombre ? Number(saisie) : suivante;
    const versionLabel = (!saisie || saisie === String(version)) ? '' : saisie;

    const affichage = versionLabel || String(version);
    // `label` reste renseigné : c'est lui que lisent les archives d'avant
    // l'introduction du titre et de la version.
    const label = titre || `Compte-rendu de prépa · v${affichage}`;
    await dbRun(
      `INSERT INTO prepa_reports (id, project_id, label, created_at, data, titre, version, version_label, version_note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, label, creeLe, data, titre, version, versionLabel, versionNote]
    );
    return { version, version_label: versionLabel };
  });

  res.json({ id, ...resultat, created_at: creeLe });
});

router.delete('/api/prepa-reports/:id', async (req, res) => {
  const photos = await dbAll('SELECT file_path FROM prepa_report_photos WHERE report_id=?', [req.params.id]);
  await withTransaction(() => dbRun('DELETE FROM prepa_reports WHERE id=?', [req.params.id]));
  supprimerFichiers(photos.map((p) => p.file_path));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Photos légendées
// ---------------------------------------------------------------------------

/**
 * Ajoute des photos à un compte-rendu.
 *
 * Les légendes arrivent dans un champ `legendes` au format JSON, dans le même
 * ordre que les fichiers — un champ texte par fichier serait ambigu si deux
 * photos portaient le même nom.
 */
router.post('/api/prepa-reports/:id/photos', upload.array('photos', 20), async (req, res) => {
  const rapport = await dbGet('SELECT id FROM prepa_reports WHERE id=?', [req.params.id]);
  if (!rapport) throw new HttpError(404, 'Compte-rendu introuvable');

  const fichiers = req.files || [];
  if (!fichiers.length) throw new HttpError(400, 'Aucune photo recue');

  const { c } = await dbGet('SELECT COUNT(*) AS c FROM prepa_report_photos WHERE report_id=?', [req.params.id]);
  if (c + fichiers.length > PHOTOS_MAX) {
    supprimerFichiers(fichiers.map((f) => f.filename));
    throw new HttpError(400, `Maximum ${PHOTOS_MAX} photos par compte-rendu`);
  }

  let legendes = [];
  try {
    const brut = JSON.parse(req.body.legendes || '[]');
    if (Array.isArray(brut)) legendes = brut;
  } catch { /* légendes absentes ou illisibles : on continue sans */ }

  const ajoutees = fichiers.map((f, i) => ({
    id: uuid(),
    file_path: f.filename,
    legende: String(legendes[i] || '').trim().slice(0, LONGUEUR_LEGENDE),
    ordre: c + i,
  }));

  await withTransaction(() => runMany(
    'INSERT INTO prepa_report_photos (id, report_id, file_path, legende, ordre) VALUES (?,?,?,?,?)',
    ajoutees.map((p) => [p.id, req.params.id, p.file_path, p.legende, p.ordre])
  ));

  res.json({ photos: ajoutees });
});

router.put('/api/prepa-report-photos/:id', async (req, res) => {
  const legende = String(req.body.legende ?? '').trim().slice(0, LONGUEUR_LEGENDE);
  await dbRun('UPDATE prepa_report_photos SET legende=? WHERE id=?', [legende, req.params.id]);
  res.json({ ok: true });
});

router.delete('/api/prepa-report-photos/:id', async (req, res) => {
  const photo = await dbGet('SELECT file_path FROM prepa_report_photos WHERE id=?', [req.params.id]);
  await dbRun('DELETE FROM prepa_report_photos WHERE id=?', [req.params.id]);
  if (photo?.file_path) supprimerFichiers([photo.file_path]);
  res.json({ ok: true });
});

module.exports = { router };
