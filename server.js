'use strict';
/**
 * Gear Check — assistant de prépa caméra.
 *
 * Point d'entrée : assemble les middlewares et les routes, prépare la base,
 * puis se met à écouter. Toute la logique vit dans `src/` :
 *
 *   src/config.js       chemins disque, port, réglages de sécurité
 *   src/db.js           connexion SQLite, helpers, transactions
 *   src/schema.js       tables, index, migrations
 *   src/referentiel.js  catégories, types, checks AOA, normalisation IA
 *   src/middleware.js   sécurité, envoi de fichiers, gestion d'erreurs
 *   src/backup.js       copies de sécurité périodiques de la base
 *   src/routes/         une famille de routes par fichier
 */
const express = require('express');
const path = require('path');
const compression = require('compression');

const {
  PORT, DB_DIR, PHOTOS_DIR, BACKUP_DIR, JSON_MAX_BYTES,
  RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX,
} = require('./src/config');
const { initSchema } = require('./src/schema');
const db = require('./src/db');
const { demarrerSauvegardes } = require('./src/backup');
const {
  hostGuard, originGuard, securityHeaders, rateLimiter,
  servePhotos, notFoundApi, errorHandler,
} = require('./src/middleware');

const app = express();

// ---------------------------------------------------------------------------
// Robustesse du process
// ---------------------------------------------------------------------------
//
// Une erreur isolée ne doit jamais arrêter le serveur : le conteneur
// redémarrerait, et sur un enchaînement d'erreurs il partirait en boucle de
// crash. Les routes asynchrones sont déjà protégées une par une (voir
// `createRouter`) ; ces deux filets couvrent le reste.
process.on('unhandledRejection', (e) => console.error('[process] promesse rejetee :', e?.stack || e));
process.on('uncaughtException', (e) => console.error('[process] exception :', e?.stack || e));

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------

// `trust proxy` en boucle locale : l'app tourne dans Docker, l'IP vue est
// celle de la passerelle du conteneur. Nécessaire pour que la limitation de
// débit distingue réellement les clients.
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

app.use(hostGuard);
app.use(securityHeaders);
app.use(compression()); // divise par ~5 le poids des réponses (mesuré sur une prépa réelle)
app.use(express.json({ limit: JSON_MAX_BYTES }));

// Fichiers de l'interface. Le HTML n'est jamais mis en cache pour qu'une mise
// à jour de l'app soit prise en compte immédiatement ; le CSS et le JS, eux,
// sont revalidés — c'est ce qui évite de retélécharger tout le front à chaque
// ouverture depuis le téléphone.
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=0, must-revalidate');
  },
}));
app.use('/photos', servePhotos);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api', rateLimiter({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }));
app.use(originGuard);

app.use(require('./src/routes/projects').router);
app.use(require('./src/routes/checklist').router);
app.use(require('./src/routes/camera').router);
app.use(require('./src/routes/rapports').router);
app.use(require('./src/routes/compteRendus').router);

/** Sonde de vie, utilisée par le healthcheck Docker. */
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

app.use('/api', notFoundApi);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

async function demarrer() {
  const { checksAvances, photosMigrees, rapportsNumerotes } = await initSchema();
  if (checksAvances) console.log(`[schema] ${checksAvances} check(s) bascule(s) en avance`);
  if (photosMigrees) console.log(`[schema] ${photosMigrees} photo(s) de defaut migree(s)`);
  if (rapportsNumerotes) console.log(`[schema] ${rapportsNumerotes} compte(s)-rendu(s) numerote(s)`);

  const sauvegardesActives = demarrerSauvegardes();

  const serveur = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gear Check :${PORT} — db: ${DB_DIR} — photos: ${PHOTOS_DIR}`
      + (sauvegardesActives ? ` — sauvegardes: ${BACKUP_DIR}` : ''));
  });

  /**
   * Arrêt propre à la demande de Docker.
   *
   * Fermer explicitement SQLite garantit qu'aucun fichier journal ne reste sur
   * le SSD externe après un `docker compose down` ou un redémarrage — c'est ce
   * qui peut rendre une base illisible au démarrage suivant.
   */
  const arreter = (signal) => {
    console.log(`[process] ${signal} recu, arret en cours`);
    serveur.close(async () => {
      await db.close();
      process.exit(0);
    });
    // Filet : si une connexion traîne, on n'attend pas indéfiniment.
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => arreter('SIGTERM'));
  process.on('SIGINT', () => arreter('SIGINT'));
}

demarrer().catch((e) => {
  console.error('[demarrage] impossible de demarrer :', e?.stack || e);
  process.exit(1);
});
