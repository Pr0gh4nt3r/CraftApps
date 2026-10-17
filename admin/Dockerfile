# ------------------------------------------------------------
#  Craft-Apps-Verwaltung – baut Oberfläche und Server in einem Image
#    docker build -t craftapps-admin:latest .
# ------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Zur Laufzeit braucht es nur node: npm/corepack (samt ihren Abhängigkeiten) wieder entfernen
# und Sicherheitsupdates für Alpine einspielen – weniger Angriffsfläche
RUN npm ci --omit=dev \
 && rm -rf /root/.npm /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && apk upgrade --no-cache
COPY --from=build /src/dist ./dist
# Läuft als Benutzer "node" (1000). Ein neues, leeres Volume übernimmt beim ersten
# Einhängen die Besitzrechte von /data aus dem Image
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD wget -qO- http://127.0.0.1:3000/healthz > /dev/null || exit 1
CMD ["node", "dist/server/main.js"]
