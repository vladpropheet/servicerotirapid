# syntax=docker/dockerfile:1
#
# Imaginile de producție (construite de Coolify din docker-compose.prod.yml):
#   app  - serverul Next.js (pagina publică + panoul), utilizator fără drepturi de administrator
#   ops  - migrări la fiecare deploy, backup criptat, ștergere automată, crearea conturilor
#
# Construire locală (pentru verificare):
#   docker build --target app -t servicerotirapid-app .
#   docker build --target ops -t servicerotirapid-ops .

ARG NODE_IMAGE=node:24-alpine

# 1. Dependențele (toate, inclusiv cele pentru build), instalate exact după package-lock.json.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2. Build: aplicația Next.js (ieșire „standalone”) + scripturile de întreținere împachetate.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

# 3. Aplicația.
FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Codul aparține lui root (aplicația nu și-l poate modifica); doar cache-ul Next.js și pozele încărcate pot fi scrise.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p .next/cache storage && chown -R node:node .next/cache storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]

# 4. Întreținere: pg_dump / pg_restore (aceeași versiune ca baza de date), age (criptare), rclone (copie în afara serverului).
FROM ${NODE_IMAGE} AS ops
RUN apk add --no-cache postgresql16-client age rclone tini
WORKDIR /app
ENV NODE_ENV=production
# Modulul nativ pentru parole (argon2), folosit la crearea conturilor.
COPY --from=deps /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --from=build /app/dist/scripts ./dist/scripts
COPY drizzle ./drizzle
COPY data/seed ./data/seed
COPY --chmod=755 docker/ops/*.sh /usr/local/bin/
# Ambele foldere aparțin lui `node`: volumul Docker preia proprietarul din imaginea care îl folosește prima.
RUN mkdir -p /backups /app/storage && chown node:node /backups /app/storage
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=120s --retries=3 CMD test -f /tmp/migrations-ok
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["ops-start.sh"]
