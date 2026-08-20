'use strict';
/**
 * Comptes-rendus de prépa archivés.
 *
 * Ce sont des instantanés figés de l'inventaire et de la checklist au moment
 * où la prépa est déclarée terminée. Le contenu (`data`) est construit et
 * relu côté client : le serveur ne fait que le conserver tel quel, ce qui
 * permet de rouvrir un ancien compte-rendu exactement dans l'état où il a été
 * généré, même si l'inventaire a changé depuis.
 */
const { dbAll, dbGet, dbRun } = require('../db');
const { createRouter, HttpError } = require('../middleware');
const { uuid, now } = require('./projects');

const router = createRouter();

/** Taille maximale d'un instantané archivé (garde-fou base). */
const SNAPSHOT_MAX_OCTETS = 4 * 1024 * 1024;

/** Liste : on ne renvoie jamais `data`, inutile ici et potentiellement lourd. */
router.get('/api/projects/:id/prepa-reports', async (req, res) => {
  res.json(await dbAll(
    'SELECT id, project_id, label, created_at FROM prepa_reports WHERE project_id=? ORDER BY created_at DESC',
    [req.params.id]
  ));
});

router.post('/api/projects/:id/prepa-reports', async (req, res) => {
  const label = String(req.body.label || '').trim() || 'Compte-rendu de prépa';
  const data = JSON.stringify(req.body.data || {});
  if (data.length > SNAPSHOT_MAX_OCTETS) {
    throw new HttpError(413, 'Compte-rendu trop volumineux pour etre archive');
  }
  const id = uuid();
  await dbRun('INSERT INTO prepa_reports (id, project_id, label, created_at, data) VALUES (?,?,?,?,?)',
    [id, req.params.id, label, now(), data]);
  res.json({ id });
});

router.get('/api/prepa-reports/:id', async (req, res) => {
  const rapport = await dbGet('SELECT * FROM prepa_reports WHERE id=?', [req.params.id]);
  if (!rapport) throw new HttpError(404, 'Compte-rendu introuvable');
  // Un instantané corrompu ne doit pas faire échouer la requête : on renvoie
  // un objet vide plutôt qu'une erreur 500 qui bloquerait tout l'onglet.
  try {
    rapport.data = JSON.parse(rapport.data);
  } catch {
    console.warn('[rapports] instantané illisible', rapport.id);
    rapport.data = {};
  }
  res.json(rapport);
});

router.delete('/api/prepa-reports/:id', async (req, res) => {
  await dbRun('DELETE FROM prepa_reports WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = { router };
