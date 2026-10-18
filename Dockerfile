# syntax=docker/dockerfile:1.7
# Ein Dockerfile für alle Dienste des Monorepos:
#   docker build --target api -t bautraeger-api .
#   docker build --target web -t bautraeger-web .
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------- Build
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable

# Erst nur die Paketbeschreibungen kopieren – so bleibt die Installation im Cache, solange sich keine Abhängigkeit ändert
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
# Optional: eigenes CA-Zertifikat für Proxys (docker build --secret id=ca,src=...)
RUN --mount=type=secret,id=ca,required=false --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @bt/domain --filter @bt/db --filter @bt/api --filter @bt/web build
# Schlankes Produktivpaket der API (nur Laufzeit-Abhängigkeiten)
RUN --mount=type=secret,id=ca,required=false --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm --filter @bt/api deploy --prod --legacy /out/api

# ---------------------------------------------------------------- API
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production API_PORT=3001 DOKUMENTE_PFAD=/data/dokumente
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
RUN mkdir -p /data/dokumente && chown -R node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:'+process.env.API_PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------- Web
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
