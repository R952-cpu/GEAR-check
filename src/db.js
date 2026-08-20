'use strict';
/**
 * Accès SQLite : connexion unique, helpers en Promise, transactions.
 *
 * Choix historiques conservés (ils viennent d'une longue série de crashs
 * Docker et ne doivent pas être changés à la légère) :
 *  - journal_mode = DELETE et non WAL. Le WAL crée un fichier de mémoire
 *    partagée (-shm) qui ne survit pas au pont entre macOS et le conteneur
 *    Docker quand la DB est sur le SSD externe monté en bind. Un seul process
 *    écrit, donc le journal classique suffit.
 *  - synchronous = FULL (défaut) : sur un disque externe qui peut être
 *    débranché, la durabilité prime sur la vitesse d'écriture.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { DB_DIR, PHOTOS_DIR } = require('./config');

fs.mkdirSync(DB_DIR, { recursive: true });
fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'regie.db');
const db = new sqlite3.Database(DB_PATH);

db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA journal_mode = DELETE');
db.exec('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------------
// Helpers Promise
// ---------------------------------------------------------------------------

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) return reject(err);
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

const dbExec = (sql) => new Promise((resolve, reject) => {
  db.exec(sql, (err) => (err ? reject(err) : resolve()));
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * File d'attente sérialisant les transactions.
 *
 * SQLite refuse une transaction imbriquée ("cannot start a transaction within
 * a transaction"). Deux requêtes HTTP simultanées qui ouvrent chacune un BEGIN
 * sur la même connexion produiraient donc une erreur. Cette file garantit
 * qu'une seule transaction est active à la fois : les autres attendent leur
 * tour au lieu d'échouer.
 */
let txQueue = Promise.resolve();

/**
 * Exécute `fn` dans une transaction, avec rollback automatique en cas d'erreur.
 *
 * Gain réel : chaque écriture SQLite hors transaction déclenche son propre
 * fsync. Sur un SSD externe, l'import d'un inventaire (plusieurs milliers
 * d'INSERT) passait ainsi de plusieurs dizaines de secondes à moins d'une.
 *
 * @param {() => Promise<T>} fn Travail à effectuer entre BEGIN et COMMIT.
 * @returns {Promise<T>} La valeur renvoyée par `fn`.
 */
function withTransaction(fn) {
  const run = async () => {
    await dbRun('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      await dbRun('COMMIT');
      return result;
    } catch (err) {
      try { await dbRun('ROLLBACK'); } catch { /* transaction déjà annulée */ }
      throw err;
    }
  };
  // On chaîne sur la file sans propager l'échec précédent aux suivants.
  const chained = txQueue.then(run, run);
  txQueue = chained.catch(() => {});
  return chained;
}

/**
 * Prépare une requête réutilisable et l'exécute N fois.
 *
 * Utilisé pour les insertions en masse (import d'inventaire) : SQLite ne
 * reparse et ne replanifie la requête qu'une seule fois au lieu d'une fois
 * par ligne.
 *
 * @param {string} sql Requête avec paramètres positionnels.
 * @param {Array<Array>} rows Un tableau de paramètres par exécution.
 */
function runMany(sql, rows) {
  return new Promise((resolve, reject) => {
    if (!rows.length) return resolve();
    const stmt = db.prepare(sql, (prepErr) => {
      if (prepErr) return reject(prepErr);
      let pending = rows.length;
      let failed = null;
      for (const params of rows) {
        stmt.run(params, (err) => {
          if (err && !failed) failed = err;
          if (--pending === 0) {
            stmt.finalize(() => (failed ? reject(failed) : resolve()));
          }
        });
      }
    });
  });
}

/**
 * Regroupe des lignes enfants par clé étrangère.
 *
 * Remplace le motif N+1 (une requête par parent) par une seule requête suivie
 * d'un regroupement en mémoire. Sur une checklist de 114 items, cela fait
 * passer le chargement de 228 requêtes à 2.
 *
 * @param {Array<object>} rows Lignes enfants déjà triées.
 * @param {string} key Nom de la colonne de clé étrangère.
 * @returns {Map<string, Array<object>>}
 */
function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/** Ferme proprement la connexion (arrêt du conteneur). */
const close = () => new Promise((resolve) => db.close(() => resolve()));

module.exports = {
  db, DB_PATH,
  dbRun, dbGet, dbAll, dbExec,
  withTransaction, runMany, groupBy, close,
};
