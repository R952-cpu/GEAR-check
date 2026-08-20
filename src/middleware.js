'use strict';
/**
 * Middlewares transverses : sécurité, robustesse, envoi de fichiers.
 *
 * Modèle de menace assumé : l'application tourne sur une machine personnelle,
 * joignable depuis le réseau local et, de l'extérieur, via un tunnel VPN. Elle
 * n'a pas d'authentification — c'est un choix documenté, pas un oubli, et il
 * suppose que l'accès réseau est déjà restreint. Les protections ci-dessous
 * visent donc :
 *   - qu'un site web piégé ouvert sur le téléphone ne puisse pas piloter l'app
 *     dans le dos de l'utilisateur (DNS-rebinding, CSRF) ;
 *   - qu'un fichier envoyé ne puisse pas devenir du code exécuté par le
 *     navigateur (XSS stockée via upload) ;
 *   - qu'aucune requête malformée ne puisse arrêter le serveur.
 */
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { PHOTOS_DIR, UPLOAD_MAX_BYTES, ALLOWED_HOSTS, ALLOW_PRIVATE_HOSTS } = require('./config');

// ---------------------------------------------------------------------------
// Routes asynchrones increvables
// ---------------------------------------------------------------------------

/**
 * Enveloppe un gestionnaire pour qu'une erreur asynchrone parte vers le
 * gestionnaire d'erreurs Express au lieu de remonter en `unhandledRejection`.
 *
 * C'est ce qui empêche une erreur isolée sur une route de faire tomber le
 * process Node — et donc de déclencher une boucle de redémarrage du conteneur.
 */
function wrapHandler(h) {
  if (typeof h !== 'function') return h;
  if (h.length >= 4) return h; // gestionnaire d'erreurs Express : laissé tel quel
  return function wrapped(req, res, next) {
    try {
      Promise.resolve(h(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Router Express dont tous les gestionnaires sont automatiquement protégés.
 *
 * Remplace l'ancienne surcharge globale de `app.get`/`app.post` : le
 * comportement est le même, mais il est explicite et local au module de
 * routes au lieu d'être un effet de bord invisible sur l'application entière.
 */
function createRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...args.map(wrapHandler));
  }
  return router;
}

// ---------------------------------------------------------------------------
// Anti-DNS-rebinding
// ---------------------------------------------------------------------------

const RE_IP_PRIVEE = /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|localhost|\[?::1\]?)$/;

/**
 * Refuse les requêtes dont l'en-tête `Host` n'est pas un hôte attendu.
 *
 * Sans ce filtre : un site malveillant ouvert sur le téléphone fait pointer
 * son propre nom de domaine vers l'IP locale du Mac. Le navigateur considère
 * alors ses requêtes vers l'app comme same-origin — ni CORS ni SameSite ne
 * s'appliquent — et le site peut lire et effacer tous les projets.
 *
 * Le coût est une comparaison de chaîne par requête, sans effet mesurable sur
 * le débit ni sur la latence.
 */
function hostGuard(req, res, next) {
  if (!ALLOWED_HOSTS.length) return next();

  const host = String(req.headers.host || '').toLowerCase();
  const hostname = host.replace(/:\d+$/, '');

  if (ALLOWED_HOSTS.includes(hostname) || ALLOWED_HOSTS.includes(host)) return next();
  if (ALLOW_PRIVATE_HOSTS && RE_IP_PRIVEE.test(hostname)) return next();

  res.status(403).type('text/plain').send('Hote non autorise');
}

/**
 * Refuse les requêtes d'écriture venant d'une autre origine (CSRF).
 *
 * Une page web tierce peut envoyer un POST multipart vers l'app sans que le
 * navigateur ne demande de pré-vérification CORS. On vérifie donc que
 * `Origin`, quand il est présent, correspond bien à l'hôte de l'app. Les
 * requêtes sans `Origin` (navigation directe, application installée sur
 * l'écran d'accueil, curl) restent acceptées.
 */
function originGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  let originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return res.status(403).json({ error: 'Origine invalide' });
  }

  if (originHost === String(req.headers.host || '').toLowerCase()) return next();
  res.status(403).json({ error: 'Origine non autorisee' });
}

// ---------------------------------------------------------------------------
// En-têtes de sécurité
// ---------------------------------------------------------------------------

/**
 * En-têtes appliqués à toutes les réponses.
 *
 * La politique de contenu autorise encore `unsafe-inline` : l'interface
 * utilise massivement des attributs `onclick=` et `style=`, les interdire
 * demanderait de réécrire tout le front. Le gain reste réel — aucun script,
 * feuille de style, image ou requête ne peut partir vers un domaine externe,
 * ce qui bloque l'exfiltration de données même si du contenu était injecté.
 */
function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}

// ---------------------------------------------------------------------------
// Limitation de débit
// ---------------------------------------------------------------------------

/**
 * Compteur glissant par adresse IP, volontairement très permissif.
 *
 * Son but n'est pas de repousser une attaque distribuée, mais d'empêcher qu'un
 * client parti en boucle sature la base et rende l'application inutilisable.
 * Les seuils viennent de la configuration (RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS).
 */
function rateLimiter({ windowMs = 60_000, max = 1200 } = {}) {
  const compteurs = new Map();

  // Purge périodique pour que la table ne grossisse pas indéfiniment.
  const purge = setInterval(() => {
    const limite = Date.now() - windowMs;
    for (const [ip, entree] of compteurs) {
      if (entree.debut < limite) compteurs.delete(ip);
    }
  }, windowMs);
  purge.unref();

  return function limiter(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'inconnu';
    const maintenant = Date.now();
    let entree = compteurs.get(ip);

    if (!entree || maintenant - entree.debut > windowMs) {
      entree = { debut: maintenant, nb: 0 };
      compteurs.set(ip, entree);
    }

    if (++entree.nb > max) {
      res.setHeader('Retry-After', Math.ceil((entree.debut + windowMs - maintenant) / 1000));
      return res.status(429).json({ error: 'Trop de requetes, patiente quelques secondes' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Envoi de fichiers
// ---------------------------------------------------------------------------

/**
 * Extensions acceptées à l'envoi, avec le type MIME servi en lecture.
 *
 * Liste blanche stricte. Le format SVG est délibérément absent : un SVG est un
 * document capable d'exécuter du script, et comme les fichiers envoyés sont
 * ensuite servis par le même domaine que l'app, l'accepter reviendrait à
 * offrir une injection de script persistante à quiconque peut envoyer un
 * fichier.
 */
const TYPES_FICHIERS = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
};
const EXTENSIONS_IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

/** Extension normalisée d'un nom de fichier, sans caractère exotique. */
function extensionSure(nomOriginal) {
  const ext = path.extname(String(nomOriginal || '')).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

/** true si l'extension correspond à une image (par opposition à un PDF). */
const estImage = (ext) => EXTENSIONS_IMAGE.has(ext);

const upload = multer({
  storage: multer.diskStorage({
    destination: PHOTOS_DIR,
    // Le nom sur disque est entièrement généré : le nom d'origine fourni par
    // le client ne sert qu'à retrouver l'extension, et n'atteint jamais le
    // système de fichiers (pas de traversée de répertoire possible).
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${extensionSure(file.originalname)}`),
  }),
  limits: {
    fileSize: UPLOAD_MAX_BYTES,
    files: 20,
    fields: 20,
    parts: 45,
  },
  fileFilter: (req, file, cb) => {
    const ext = extensionSure(file.originalname);
    if (!TYPES_FICHIERS[ext]) {
      return cb(new HttpError(415, `Format non accepte : ${ext || 'inconnu'} (photos et PDF uniquement)`));
    }
    cb(null, true);
  },
});

/**
 * Sert les fichiers envoyés sans jamais laisser le navigateur les interpréter.
 *
 * Trois garde-fous : type MIME imposé depuis notre liste blanche (et non
 * deviné), `nosniff` pour interdire au navigateur de le redeviner, et une
 * politique de contenu qui coupe toute exécution même si un fichier hostile
 * parvenait malgré tout à se retrouver là. Les noms étant des identifiants
 * uniques, le contenu ne change jamais : il est mis en cache pour un an.
 */
const servePhotos = express.static(PHOTOS_DIR, {
  index: false,
  dotfiles: 'deny',
  fallthrough: false,
  maxAge: '365d',
  immutable: true,
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', TYPES_FICHIERS[ext] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', TYPES_FICHIERS[ext] ? 'inline' : 'attachment');
  },
});

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

/** Erreur applicative portant un code HTTP et un message destiné à l'écran. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

/** 404 JSON pour toute route d'API inexistante. */
function notFoundApi(req, res) {
  res.status(404).json({ error: 'Route inconnue' });
}

/**
 * Gestionnaire d'erreurs final.
 *
 * Traduit les erreurs connues (validation, upload) en messages lisibles, et
 * masque le détail des autres : un message d'erreur interne peut révéler des
 * chemins disque ou la structure de la base.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'Fichier trop volumineux',
      LIMIT_FILE_COUNT: 'Trop de fichiers envoyes en une fois',
      LIMIT_PART_COUNT: 'Envoi trop complexe',
    };
    console.warn('[upload]', err.code, err.message);
    return res.status(413).json({ error: messages[err.code] || 'Envoi refuse' });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Donnees trop volumineuses' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }

  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[api]', req.method, req.originalUrl, '—', err?.stack || err);
  else console.warn('[api]', req.method, req.originalUrl, '—', err?.message);

  res.status(status).json({
    error: err?.expose || status < 500 ? (err?.message || 'Requete invalide') : 'Erreur serveur',
  });
}

module.exports = {
  createRouter, wrapHandler,
  hostGuard, originGuard, securityHeaders, rateLimiter,
  upload, servePhotos, estImage, extensionSure, TYPES_FICHIERS,
  HttpError, notFoundApi, errorHandler,
};
