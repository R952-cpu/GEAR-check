'use strict';
/**
 * Profils de réglages caméra.
 *
 * Un profil regroupe plusieurs caméras identiques et porte les réglages menu
 * à appliquer sur chacune. Il n'apparaît dans la Checklist (couleur sur les
 * caméras, réglages à cocher) qu'une fois explicitement confirmé — ce qui
 * évite d'y voir surgir des brouillons en cours d'écriture.
 */
const { dbAll, dbGet, dbRun, withTransaction, groupBy } = require('../db');
const { createRouter, HttpError } = require('../middleware');
const { uuid, now } = require('./projects');

const router = createRouter();

const COULEUR_PAR_DEFAUT = '#2ed6b3';
/** N'accepte qu'une couleur hexadécimale : cette valeur finit dans du CSS. */
const couleurValide = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c) : COULEUR_PAR_DEFAUT);

/** Profils du projet, chacun avec ses réglages — deux requêtes, sans N+1. */
router.get('/api/projects/:id/camera-profiles', async (req, res) => {
  const profils = await dbAll('SELECT * FROM camera_profiles WHERE project_id=? ORDER BY created_at', [req.params.id]);
  const reglages = await dbAll(
    `SELECT s.* FROM camera_profile_settings s
     JOIN camera_profiles p ON p.id = s.profile_id
     WHERE p.project_id = ? ORDER BY s.profile_id, s.ordre`,
    [req.params.id]
  );
  const parProfil = groupBy(reglages, 'profile_id');
  for (const profil of profils) profil.settings = parProfil.get(profil.id) || [];
  res.json(profils);
});

router.post('/api/projects/:id/camera-profiles', async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) throw new HttpError(400, 'Le nom du profil est obligatoire');
  const id = uuid();
  await dbRun('INSERT INTO camera_profiles (id, project_id, label, color, validated, created_at) VALUES (?,?,?,?,0,?)',
    [id, req.params.id, label, couleurValide(req.body.color), now()]);
  res.json({ id });
});

router.put('/api/camera-profiles/:id', async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) throw new HttpError(400, 'Le nom du profil est obligatoire');
  await dbRun('UPDATE camera_profiles SET label=?, color=? WHERE id=?',
    [label, couleurValide(req.body.color), req.params.id]);
  res.json({ ok: true });
});

/** Confirme le profil : c'est ce qui le fait apparaître dans la Checklist. */
router.post('/api/camera-profiles/:id/validate', async (req, res) => {
  await dbRun('UPDATE camera_profiles SET validated=1 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

router.delete('/api/camera-profiles/:id', async (req, res) => {
  await withTransaction(async () => {
    await dbRun("UPDATE checklist_items SET camera_profile_id='' WHERE camera_profile_id=?", [req.params.id]);
    await dbRun('DELETE FROM camera_profiles WHERE id=?', [req.params.id]);
  });
  res.json({ ok: true });
});

router.post('/api/camera-profiles/:id/settings', async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) throw new HttpError(400, 'Le texte du reglage est obligatoire');
  const id = uuid();
  const { c } = await dbGet('SELECT COUNT(*) AS c FROM camera_profile_settings WHERE profile_id=?', [req.params.id]);
  await dbRun('INSERT INTO camera_profile_settings (id, profile_id, text, done, ordre) VALUES (?,?,?,0,?)',
    [id, req.params.id, text, c]);
  res.json({ id });
});

router.put('/api/camera-profile-settings/:id', async (req, res) => {
  await dbRun('UPDATE camera_profile_settings SET done=? WHERE id=?', [req.body.done ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});

router.delete('/api/camera-profile-settings/:id', async (req, res) => {
  await dbRun('DELETE FROM camera_profile_settings WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = { router };
