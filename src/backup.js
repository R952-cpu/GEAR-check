'use strict';
/**
 * Copies de sécurité périodiques de la base.
 *
 * Quand la base vit sur un disque externe, une sauvegarde n'a d'intérêt que si
 * elle est écrite AILLEURS — sur un autre disque — pour survivre à un
 * débranchement ou à une panne de ce disque.
 *
 * `VACUUM INTO` produit un fichier SQLite complet et cohérent même pendant que
 * l'app écrit : c'est la méthode recommandée, à la différence d'une simple
 * copie du fichier qui pourrait attraper une écriture à moitié terminée.
 */
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const { BACKUP_DIR, BACKUP_INTERVAL_MS, BACKUP_KEEP } = require('./config');

const horodatage = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Ne conserve que les `BACKUP_KEEP` sauvegardes les plus récentes. */
function purgerAnciennes() {
  const fichiers = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('regie-') && f.endsWith('.db'))
    .sort()
    .reverse();
  for (const vieux of fichiers.slice(BACKUP_KEEP)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, vieux)); } catch { /* déjà supprimé */ }
  }
}

/** Écrit une sauvegarde datée, puis fait tourner les anciennes. */
function sauvegarder() {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const destination = path.join(BACKUP_DIR, `regie-${horodatage()}.db`);
      db.run('VACUUM INTO ?', [destination], (err) => {
        if (err) {
          console.error('[backup] echec :', err.message);
        } else {
          try { purgerAnciennes(); } catch (e) { console.error('[backup] purge :', e.message); }
        }
        resolve(!err);
      });
    } catch (e) {
      console.error('[backup] echec :', e.message);
      resolve(false);
    }
  });
}

/**
 * Démarre la sauvegarde périodique si `BACKUP_DIR` est configuré.
 * @returns {boolean} true si la sauvegarde est active.
 */
function demarrerSauvegardes() {
  if (!BACKUP_DIR) return false;
  const timer = setInterval(sauvegarder, BACKUP_INTERVAL_MS);
  timer.unref(); // n'empêche jamais l'arrêt du process
  setTimeout(sauvegarder, 30_000).unref(); // une première passe peu après le démarrage
  return true;
}

module.exports = { sauvegarder, demarrerSauvegardes };
