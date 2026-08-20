# syntax=docker/dockerfile:1

# --- Étape 1 : dépendances ------------------------------------------------
# Les outils de compilation ne servent qu'à construire le binding natif de
# sqlite3. Les isoler dans une étape séparée évite de les embarquer dans
# l'image finale, qui n'en a plus besoin une fois le binding compilé.
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installe exactement ce que décrit package-lock.json : deux builds du
# même commit produisent donc rigoureusement les mêmes dépendances.
RUN npm ci --omit=dev

# --- Étape 2 : image finale ----------------------------------------------
FROM node:22-alpine
WORKDIR /app

# `tini` fait office de PID 1 : il transmet correctement le SIGTERM envoyé par
# Docker à l'arrêt, ce qui laisse le serveur fermer proprement la base SQLite
# posée sur le SSD externe au lieu d'être tué net.
RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000

# Le conteneur se déclare en bonne santé tant que l'API répond. Docker peut
# ainsi le redémarrer tout seul s'il se fige, au lieu de le laisser en place.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

# Ne pas tourner en root : limite les dégâts en cas de faille dans une dépendance.
USER node
