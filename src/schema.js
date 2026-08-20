'use strict';
/**
 * Schéma de la base : tables, index, migrations.
 *
 * `initSchema()` est attendu (await) avant que le serveur ne se mette à
 * écouter : ainsi aucune requête ne peut arriver sur une base dont les
 * colonnes ou les index ne seraient pas encore en place.
 */
const crypto = require('crypto');
const { dbExec, dbRun, dbGet, dbAll, withTransaction } = require('./db');
const { advancedCheckLabels } = require('./referentiel');

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
const TABLES = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prod TEXT DEFAULT '',
    loueur TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    assistant TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    prepa_date TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS prepa_attachments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS manques (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    qty TEXT DEFAULT '',
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'a_demander',
    ordre INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS compte_rendus (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    semaine_label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    date TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS defauts (
    id TEXT PRIMARY KEY,
    compte_rendu_id TEXT NOT NULL REFERENCES compte_rendus(id) ON DELETE CASCADE,
    equipement_label TEXT DEFAULT '',
    provenance TEXT DEFAULT '',
    nom_objet TEXT NOT NULL,
    photo_path TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS defaut_photos (
    id TEXT PRIMARY KEY,
    defaut_id TEXT NOT NULL REFERENCES defauts(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    ordre INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS cr_notes (
    id TEXT PRIMARY KEY,
    compte_rendu_id TEXT NOT NULL REFERENCES compte_rendus(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    color TEXT DEFAULT 'noir',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS checklist_phases (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT DEFAULT '',
    label TEXT NOT NULL,
    sub TEXT DEFAULT '',
    ordre INTEGER DEFAULT 0,
    custom INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS checklist_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    designation TEXT NOT NULL,
    quantite INTEGER DEFAULT 1,
    reference TEXT DEFAULT '',
    categorie TEXT DEFAULT 'ACCESSOIRE',
    type TEXT DEFAULT '',
    sous_type TEXT DEFAULT '',
    emplacement TEXT DEFAULT '',
    identifiant TEXT DEFAULT '',
    presence_cochee INTEGER DEFAULT 0,
    ordre INTEGER DEFAULT 0,
    phase_id TEXT DEFAULT '',
    camera_profile_id TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS checklist_checks (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    ordre INTEGER DEFAULT 0,
    avance INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS checklist_notes (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS camera_profiles (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    color TEXT DEFAULT '#2ed6b3',
    validated INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS camera_profile_settings (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES camera_profiles(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    ordre INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS prepa_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------
//
// La base n'en avait aucun en dehors des clés primaires : chaque lecture
// « toutes les lignes d'un projet » ou « tous les checks d'un item » balayait
// la table entière. Sur une checklist de 114 items c'était plusieurs centaines
// de balayages complets à chaque case cochée. Ces index rendent ces lectures
// directes, et le coût à l'écriture est négligeable à cette échelle.
const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_items_project        ON checklist_items(project_id);
  CREATE INDEX IF NOT EXISTS idx_items_project_phase  ON checklist_items(project_id, phase_id);
  CREATE INDEX IF NOT EXISTS idx_items_project_ordre  ON checklist_items(project_id, ordre);
  CREATE INDEX IF NOT EXISTS idx_items_profile        ON checklist_items(camera_profile_id);
  CREATE INDEX IF NOT EXISTS idx_checks_item          ON checklist_checks(item_id, ordre);
  CREATE INDEX IF NOT EXISTS idx_notes_item           ON checklist_notes(item_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_phases_project       ON checklist_phases(project_id, ordre);
  CREATE INDEX IF NOT EXISTS idx_profiles_project     ON camera_profiles(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_settings_profile     ON camera_profile_settings(profile_id, ordre);
  CREATE INDEX IF NOT EXISTS idx_manques_project      ON manques(project_id, ordre);
  CREATE INDEX IF NOT EXISTS idx_attach_project       ON prepa_attachments(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_reports_project      ON prepa_reports(project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_cr_project           ON compte_rendus(project_id);
  CREATE INDEX IF NOT EXISTS idx_defauts_cr           ON defauts(compte_rendu_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_defphotos_defaut     ON defaut_photos(defaut_id, ordre);
  CREATE INDEX IF NOT EXISTS idx_crnotes_cr           ON cr_notes(compte_rendu_id, created_at);
`;

// Tables abandonnées au fil des refontes successives. Elles sont supprimées
// si elles traînent encore dans une base existante.
const TABLES_OBSOLETES = [
  'fiche_items', 'fiche_sections', 'fiche_attachments', 'fiches', 'fiche_templates',
  'prepa_points', 'prepa_sousparties', 'prepa_parties', 'prepa_items',
  'checklist_templates', 'equipements',
];

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/** Ajoute une colonne si elle manque (bases créées avant son introduction). */
async function ensureColumn(table, col, ddl) {
  const cols = await dbAll(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === col)) {
    await dbExec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

const COLONNES_AJOUTEES = [
  ['compte_rendus', 'date', "date TEXT DEFAULT ''"],
  ['projects', 'assistant', "assistant TEXT DEFAULT ''"],
  ['projects', 'email', "email TEXT DEFAULT ''"],
  ['projects', 'phone', "phone TEXT DEFAULT ''"],
  ['projects', 'prepa_date', "prepa_date TEXT DEFAULT ''"],
  ['checklist_items', 'type', "type TEXT DEFAULT ''"],
  ['checklist_items', 'sous_type', "sous_type TEXT DEFAULT ''"],
  ['checklist_items', 'phase_id', "phase_id TEXT DEFAULT ''"],
  ['checklist_items', 'camera_profile_id', "camera_profile_id TEXT DEFAULT ''"],
  ['checklist_items', 'identifiant', "identifiant TEXT DEFAULT ''"],
  ['checklist_checks', 'avance', 'avance INTEGER DEFAULT 0'],
  ['camera_profiles', 'color', "color TEXT DEFAULT '#2ed6b3'"],
  ['camera_profiles', 'validated', 'validated INTEGER DEFAULT 0'],
];

const getMeta = async (key) => (await dbGet('SELECT value FROM meta WHERE key=?', [key]))?.value || null;
const setMeta = (key, value) => dbRun('INSERT INTO meta (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);

/**
 * Marque comme « avancés » les checks déjà en base dont le libellé est passé
 * en avancé dans le référentiel.
 *
 * Sans cela, il faudrait réimporter tout l'inventaire pour qu'un check
 * nouvellement jugé secondaire disparaisse du mode simple. La liste est
 * désormais dérivée du référentiel lui-même (plus de liste dupliquée à tenir
 * à jour), et l'opération ne rejoue que si cette liste a changé.
 */
async function syncAdvancedChecks() {
  const labels = advancedCheckLabels().sort();
  // Empreinte du contenu de la liste : si un libellé change, est ajouté ou
  // retiré, l'empreinte change et la synchronisation rejoue une fois.
  const empreinte = crypto.createHash('sha1').update(labels.join('\u0000')).digest('hex');
  if (await getMeta('advanced_checks_sync') === empreinte) return 0;

  const placeholders = labels.map(() => '?').join(',');
  const { changes } = await dbRun(
    `UPDATE checklist_checks SET avance=1 WHERE avance=0 AND label IN (${placeholders})`,
    labels
  );
  await setMeta('advanced_checks_sync', empreinte);
  return changes;
}

/**
 * Reprend l'ancienne photo unique d'un défaut dans la table multi-photos.
 *
 * Migration ponctuelle datant du passage à plusieurs photos par défaut. Elle
 * ne rejoue plus une fois effectuée.
 */
async function migrateDefautPhotos() {
  if (await getMeta('defaut_photos_migrated')) return 0;
  const orphelins = await dbAll(`
    SELECT d.id, d.photo_path FROM defauts d
    WHERE d.photo_path != ''
      AND NOT EXISTS (SELECT 1 FROM defaut_photos p WHERE p.defaut_id = d.id)
  `);
  for (const d of orphelins) {
    await dbRun('INSERT INTO defaut_photos (id, defaut_id, file_path, ordre) VALUES (?,?,?,0)',
      [crypto.randomUUID(), d.id, d.photo_path]);
  }
  await setMeta('defaut_photos_migrated', '1');
  return orphelins.length;
}

/**
 * Crée les tables et index manquants, applique les migrations, nettoie les
 * tables obsolètes. Idempotent : peut être rejoué à chaque démarrage.
 */
async function initSchema() {
  await dbExec(TABLES);
  await dbExec(INDEXES);
  await dbExec(TABLES_OBSOLETES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n'));

  for (const [table, col, ddl] of COLONNES_AJOUTEES) {
    await ensureColumn(table, col, ddl);
  }

  const [checks, photos] = await withTransaction(async () => [
    await syncAdvancedChecks(),
    await migrateDefautPhotos(),
  ]);

  // ANALYZE met à jour les statistiques dont SQLite se sert pour choisir un
  // index plutôt qu'un balayage. Sans lui, des index tout juste créés peuvent
  // rester ignorés par le planificateur.
  await dbExec('ANALYZE');

  return { checksAvances: checks, photosMigrees: photos };
}

module.exports = { initSchema, getMeta, setMeta };
