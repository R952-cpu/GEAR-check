'use strict';
/**
 * Configuration centrale : chemins disque, port, réglages de sécurité.
 *
 * Tout est pilotable par variable d'environnement (docker-compose.yml) pour
 * qu'aucun chemin ne soit codé en dur dans la logique métier.
 */
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,

  DATA_DIR,
  // Base de données et photos. Peut pointer vers un disque externe monté en
  // bind dans le conteneur (voir DATA_PATH dans .env).
  DB_DIR: process.env.DB_DIR || path.join(DATA_DIR, 'db'),
  PHOTOS_DIR: process.env.PHOTOS_DIR || path.join(DATA_DIR, 'photos'),
  // Copie de sécurité périodique de la DB. Vide = désactivé.
  BACKUP_DIR: process.env.BACKUP_DIR || '',
  BACKUP_INTERVAL_MS: Number(process.env.BACKUP_INTERVAL_MS) || 10 * 60 * 1000,
  BACKUP_KEEP: Number(process.env.BACKUP_KEEP) || 8,

  // Limitation de débit sur l'API : fenêtre glissante et nombre maximal de
  // requêtes par adresse sur cette fenêtre. Volontairement large — il s'agit
  // d'empêcher un client parti en boucle de saturer la base, pas de repousser
  // une attaque distribuée.
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 1200,

  // Taille maximale d'une photo/PDF envoyé depuis le téléphone.
  UPLOAD_MAX_BYTES: Number(process.env.UPLOAD_MAX_BYTES) || 30 * 1024 * 1024,
  // Taille maximale d'un corps JSON. Généreuse : un import d'inventaire d'un
  // gros tournage ou un compte-rendu de prépa archivé peuvent être volumineux.
  JSON_MAX_BYTES: process.env.JSON_MAX_BYTES || '8mb',

  /**
   * Hôtes autorisés à joindre l'API (protection anti-DNS-rebinding).
   *
   * Sans ce filtre, un site web piégé ouvert sur le téléphone peut faire
   * pointer son propre domaine vers l'IP locale du Mac et piloter l'app à
   * l'insu de l'utilisateur : le navigateur considère alors les requêtes comme
   * same-origin, donc ni CORS ni le cookie de session ne le bloquent.
   * Le coût est une simple comparaison de chaîne par requête.
   *
   * Vide = tout accepter (comportement historique, à éviter).
   */
  ALLOWED_HOSTS: (process.env.ALLOWED_HOSTS || 'localhost,127.0.0.1,[::1]')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  // Laisse passer n'importe quelle IP privée (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  // pour que l'app continue de répondre si la box change l'adresse de la
  // machine, ou depuis l'adresse attribuée par un tunnel VPN.
  ALLOW_PRIVATE_HOSTS: process.env.ALLOW_PRIVATE_HOSTS !== 'false',
};
