# syntax=docker/dockerfile:1.7

# OpenBoard AI — single-image build that bundles the React (Vite) web app and
# the Hono API into one Node process. The API serves the built web assets out
# of apps/web/dist (see apps/api/src/index.ts), so one container is enough.
#
# Postgres is provided by the companion service in docker-compose.yml.

ARG NODE_VERSION=22-alpine

############################
# 1. base — node + pnpm
############################
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

############################
# 2. deps — install full workspace deps (frozen lockfile)
############################
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

############################
# 3. build — typecheck + build web, api, shared
############################
FROM base AS build
# tldraw license key gets baked into the web bundle at build time.
# Leave empty to ship with the "Made with tldraw" watermark (see README).
ARG VITE_TLDRAW_LICENSE_KEY=""
ENV VITE_TLDRAW_LICENSE_KEY=$VITE_TLDRAW_LICENSE_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm build

############################
# 4. prod-deps — production-only deps for the api
############################
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter @openboard-ai/api... \
      --filter @openboard-ai/shared

############################
# 5. runner — minimal runtime image
############################
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as the non-root `node` user that ships with the official image.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist

COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||process.env.API_PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
