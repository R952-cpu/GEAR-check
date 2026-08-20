'use strict';
/**
 * Comptes-rendus hebdomadaires de tournage : défauts photographiés et notes.
 *
 * Partie la plus ancienne de l'app, volontairement inchangée dans son
 * fonctionnement : seules les lectures groupées, les transactions et la
 * validation des entrées ont été revues.
 */
const { dbAll, dbGet, dbRun, withTransaction, runMany, groupBy } = require('../db');
const { createRouter, upload, HttpError } = require('../middleware');
const { uuid, now, supprimerFichiers } = require('./projects');

const router = createRouter();

/** Couleurs autorisées pour une note (le client n'en propose pas d'autres). */
const COULEURS_NOTE = new Set(['noir', 'rouge', 'bleu', 'vert']);
const couleurNote = (c) => (COULEURS_NOTE.has(String(c)) ? String(c) : 'noir');

// --- Comptes-rendus -------------------------------------------------------

router.get('/api/projects/:id/compte-rendus', async (req, res) => {
  res.json(await dbAll(
    "SELECT * FROM compte_rendus WHERE project_id=? ORDER BY COALESCE(NULLIF(date,''), created_at) DESC",
    [req.params.id]
  ));
});

router.post('/api/projects/:id/compte-rendus', async (req, res) => {
  const semaine = String(req.body.semaine_label || '').trim();
  if (!semaine) throw new HttpError(400, 'Le libelle de la semaine est obligatoire');
  const id = uuid();
  await dbRun('INSERT INTO compte_rendus (id, project_id, semaine_label, created_at, date) VALUES (?,?,?,?,?)',
    [id, req.params.id, semaine, now(), req.body.date || '']);
  res.json({ id });
});

/** Détail complet : défauts, leurs photos et les notes, en trois requêtes. */
router.get('/api/compte-rendus/:id', async (req, res) => {
  const cr = await dbGet('SELECT * FROM compte_rendus WHERE id=?', [req.params.id]);
  if (!cr) throw new HttpError(404, 'Compte-rendu introuvable');

  const [defauts, photos, notes] = await Promise.all([
    dbAll('SELECT * FROM defauts WHERE compte_rendu_id=? ORDER BY created_at', [req.params.id]),
    dbAll(`SELECT p.id, p.defaut_id, p.file_path FROM defaut_photos p
           JOIN defauts d ON d.id = p.defaut_id
           WHERE d.compte_rendu_id = ? ORDER BY p.defaut_id, p.ordre`, [req.params.id]),
    dbAll('SELECT * FROM cr_notes WHERE compte_rendu_id=? ORDER BY created_at', [req.params.id]),
  ]);

  const photosParDefaut = groupBy(photos, 'defaut_id');
  for (const defaut of defauts) defaut.photos = photosParDefaut.get(defaut.id) || [];

  cr.defauts = defauts;
  cr.notes = notes;
  res.json(cr);
});

router.put('/api/compte-rendus/:id', async (req, res) => {
  const semaine = String(req.body.semaine_label || '').trim();
  if (!semaine) throw new HttpError(400, 'Le libelle de la semaine est obligatoire');
  await dbRun('UPDATE compte_rendus SET semaine_label=?, date=? WHERE id=?',
    [semaine, req.body.date ?? '', req.params.id]);
  res.json({ ok: true });
});

router.delete('/api/compte-rendus/:id', async (req, res) => {
  const fichiers = [
    ...(await dbAll('SELECT photo_path AS file_path FROM defauts WHERE compte_rendu_id=?', [req.params.id])),
    ...(await dbAll(`SELECT p.file_path FROM defaut_photos p
                     JOIN defauts d ON d.id = p.defaut_id
                     WHERE d.compte_rendu_id=?`, [req.params.id])),
  ].map((r) => r.file_path);

  await withTransaction(() => dbRun('DELETE FROM compte_rendus WHERE id=?', [req.params.id]));
  supprimerFichiers(fichiers);
  res.json({ ok: true });
});

// --- Notes libres colorées ------------------------------------------------

router.post('/api/compte-rendus/:id/notes', async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw new HttpError(400, 'Le texte est obligatoire');
  const id = uuid();
  await dbRun('INSERT INTO cr_notes (id, compte_rendu_id, text, color, created_at) VALUES (?,?,?,?,?)',
    [id, req.params.id, text, couleurNote(req.body.color), now()]);
  res.json({ id });
});

router.put('/api/cr-notes/:id', async (req, res) => {
  await dbRun('UPDATE cr_notes SET text=?, color=? WHERE id=?',
    [req.body.text, couleurNote(req.body.color), req.params.id]);
  res.json({ ok: true });
});

router.delete('/api/cr-notes/:id', async (req, res) => {
  await dbRun('DELETE FROM cr_notes WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// --- Défauts et leurs photos ---------------------------------------------

router.post('/api/compte-rendus/:id/defauts', upload.array('photos', 20), async (req, res) => {
  const id = uuid();
  const fichiers = req.files || [];
  await withTransaction(async () => {
    await dbRun(
      `INSERT INTO defauts (id, compte_rendu_id, equipement_label, provenance, nom_objet, photo_path, note, created_at)
       VALUES (?,?,?,'',?,'',?,?)`,
      [id, req.params.id, req.body.equipement_label || '',
        String(req.body.nom_objet || '').trim() || 'Objet', req.body.note || '', now()]
    );
    await runMany('INSERT INTO defaut_photos (id, defaut_id, file_path, ordre) VALUES (?,?,?,?)',
      fichiers.map((f, ordre) => [uuid(), id, f.filename, ordre]));
  });
  res.json({ id });
});

router.put('/api/defauts/:id', async (req, res) => {
  await dbRun('UPDATE defauts SET equipement_label=?, nom_objet=?, note=? WHERE id=?',
    [req.body.equipement_label ?? '', String(req.body.nom_objet || '').trim() || 'Objet',
      req.body.note ?? '', req.params.id]);
  res.json({ ok: true });
});

router.delete('/api/defauts/:id', async (req, res) => {
  const photos = await dbAll('SELECT file_path FROM defaut_photos WHERE defaut_id=?', [req.params.id]);
  const defaut = await dbGet('SELECT photo_path FROM defauts WHERE id=?', [req.params.id]);

  await withTransaction(() => dbRun('DELETE FROM defauts WHERE id=?', [req.params.id]));
  supprimerFichiers([...photos.map((p) => p.file_path), defaut?.photo_path]);
  res.json({ ok: true });
});

router.post('/api/defauts/:id/photos', upload.array('photos', 20), async (req, res) => {
  const { c } = await dbGet('SELECT COUNT(*) AS c FROM defaut_photos WHERE defaut_id=?', [req.params.id]);
  const ajoutees = (req.files || []).map((f, i) => ({ id: uuid(), file_path: f.filename, ordre: c + i }));
  await withTransaction(() => runMany(
    'INSERT INTO defaut_photos (id, defaut_id, file_path, ordre) VALUES (?,?,?,?)',
    ajoutees.map((p) => [p.id, req.params.id, p.file_path, p.ordre])
  ));
  res.json({ photos: ajoutees.map(({ id, file_path }) => ({ id, file_path })) });
});

router.delete('/api/defaut-photos/:id', async (req, res) => {
  const photo = await dbGet('SELECT * FROM defaut_photos WHERE id=?', [req.params.id]);
  await dbRun('DELETE FROM defaut_photos WHERE id=?', [req.params.id]);
  if (photo?.file_path) supprimerFichiers([photo.file_path]);
  res.json({ ok: true });
});

module.exports = { router };
