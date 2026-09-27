# syntax=docker/dockerfile:1
# image ของ API (build จาก root ของ repo: docker build -f apps/api/Dockerfile .)
ARG NODE_IMAGE=node:24.13.1-alpine

FROM ${NODE_IMAGE} AS base
RUN npm install -g pnpm@12.6.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/

# คอมไพล์ TypeScript (ต้องมี devDependencies)
FROM base AS build
RUN pnpm install --frozen-lockfile --filter api
COPY apps/api apps/api
RUN pnpm --filter api build

# dependency สำหรับรันจริงเท่านั้น
FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter api

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
# migration (.sql) รันด้วย node-pg-migrate จาก image เดียวกัน (ดู deploy/scripts/deploy.sh)
COPY apps/api/migrations ./apps/api/migrations
COPY apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
