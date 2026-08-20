'use strict';
/**
 * Projets, manques (matériel à demander au loueur) et fichiers joints.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { dbAll, dbGet, dbRun, withTransaction } = require('../db');
const { createRouter, upload, estImage, extensionSure, HttpError } = require('../middleware');
const { PHOTOS_DIR } = require('../config');

const router = createRouter();
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

/** Supprime des fichiers du disque sans jamais faire échouer la requête. */
function supprimerFichiers(chemins) {
  for (const nom of chemins) {
    if (!nom) continue;
    // `path.basename` neutralise toute tentative de sortir du dossier photos
    // si un nom de fichier corrompu s'était retrouvé en base.
    try { fs.unlinkSync(path.join(PHOTOS_DIR, path.basename(nom))); } catch { /* déjà absent */ }
  }
}

// --- Projets --------------------------------------------------------------

router.get('/api/projects', async (req, res) => {
  res.json(await dbAll('SELECT * FROM projects ORDER BY created_at DESC'));
});

router.post('/api/projects', async (req, res) => {
  const { name, prod, loueur, assistant, email, phone } = req.body;
  if (!name || !String(name).trim()) throw new HttpError(400, 'Le nom du projet est obligatoire');
  const id = uuid();
  await dbRun(
    'INSERT INTO projects (id, name, prod, loueur, created_at, assistant, email, phone) VALUES (?,?,?,?,?,?,?,?)',
    [id, String(name).trim(), prod || '', loueur || '', now(), assistant || '', email || '', phone || '']
  );
  res.json({ id });
});

router.get('/api/projects/:id', async (req, res) => {
  const projet = await dbGet('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!projet) throw new HttpError(404, 'Projet introuvable');
  res.json(projet);
});

router.put('/api/projects/:id', async (req, res) => {
  const { name, prod, loueur, assistant, email, phone } = req.body;
  if (!name || !String(name).trim()) throw new HttpError(400, 'Le nom du projet est obligatoire');
  await dbRun(
    'UPDATE projects SET name=?, prod=?, loueur=?, assistant=?, email=?, phone=? WHERE id=?',
    [String(name).trim(), prod || '', loueur || '', assistant || '', email || '', phone || '', req.params.id]
  );
  res.json({ ok: true });
});

/**
 * Supprime un projet et tout ce qui en dépend.
 *
 * Les lignes de la base partent en cascade (clés étrangères), mais pas les
 * fichiers sur le disque : on les collecte donc avant de supprimer. La
 * suppression en base se fait en transaction pour qu'un projet ne puisse pas
 * rester à moitié effacé si l'écriture échoue en cours de route.
 */
router.delete('/api/projects/:id', async (req, res) => {
  const id = req.params.id;
  const fichiers = [
    ...(await dbAll('SELECT file_path FROM prepa_attachments WHERE project_id=?', [id])),
    ...(await dbAll(`SELECT d.photo_path AS file_path FROM defauts d
                     JOIN compte_rendus c ON d.compte_rendu_id=c.id WHERE c.project_id=?`, [id])),
    ...(await dbAll(`SELECT dp.file_path FROM defaut_photos dp
                     JOIN defauts d ON dp.defaut_id=d.id
                     JOIN compte_rendus c ON d.compte_rendu_id=c.id WHERE c.project_id=?`, [id])),
  ].map((r) => r.file_path);

  await withTransaction(() => dbRun('DELETE FROM projects WHERE id=?', [id]));
  supprimerFichiers(fichiers);
  res.json({ ok: true });
});

// --- Manques (matériel à demander au loueur) ------------------------------

router.get('/api/projects/:id/manques', async (req, res) => {
  res.json(await dbAll('SELECT * FROM manques WHERE project_id=? ORDER BY ordre', [req.params.id]));
});

router.post('/api/projects/:id/manques', async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) throw new HttpError(400, 'Le libelle est obligatoire');
  const id = uuid();
  const { c } = await dbGet('SELECT COUNT(*) AS c FROM manques WHERE project_id=?', [req.params.id]);
  await dbRun(
    "INSERT INTO manques (id, project_id, label, qty, note, status, ordre) VALUES (?,?,?,?,?,'a_demander',?)",
    [id, req.params.id, label, req.body.qty || '', req.body.note || '', c]
  );
  res.json({ id });
});

router.put('/api/manques/:id', async (req, res) => {
  await dbRun('UPDATE manques SET label=?, qty=?, note=?, status=? WHERE id=?', [
    req.body.label, req.body.qty ?? '', req.body.note ?? '', req.body.status ?? 'a_demander', req.params.id,
  ]);
  res.json({ ok: true });
});

router.delete('/api/manques/:id', async (req, res) => {
  await dbRun('DELETE FROM manques WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// --- Fichiers joints à la prépa (photos / PDF de la liste matos) ----------

router.post('/api/projects/:id/prepa/attachments', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Aucun fichier recu');
  const id = uuid();
  const ext = extensionSure(req.file.originalname);
  await dbRun('INSERT INTO prepa_attachments (id, project_id, name, file_type, file_path, created_at) VALUES (?,?,?,?,?,?)',
    [id, req.params.id, req.file.originalname, estImage(ext) ? 'photo' : 'pdf', req.file.filename, now()]);
  res.json({ id, filename: req.file.filename, file_type: estImage(ext) ? 'photo' : 'pdf' });
});

router.get('/api/projects/:id/prepa/attachments', async (req, res) => {
  res.json(await dbAll('SELECT * FROM prepa_attachments WHERE project_id=? ORDER BY created_at DESC', [req.params.id]));
});

router.delete('/api/prepa-attachments/:id', async (req, res) => {
  const piece = await dbGet('SELECT * FROM prepa_attachments WHERE id=?', [req.params.id]);
  await dbRun('DELETE FROM prepa_attachments WHERE id=?', [req.params.id]);
  if (piece) supprimerFichiers([piece.file_path]);
  res.json({ ok: true });
});

module.exports = { router, supprimerFichiers, uuid, now };
