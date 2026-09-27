# syntax=docker/dockerfile:1
# image ของ web (build จาก root ของ repo: docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=... .)
ARG NODE_IMAGE=node:24.13.1-alpine

FROM ${NODE_IMAGE} AS build
RUN npm install -g pnpm@12.6.0
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web
COPY apps/web apps/web
# NEXT_PUBLIC_* ถูกฝังลงโค้ดฝั่ง browser ตอน build — image จึงผูกกับ URL ของ API ที่ระบุ
ARG NEXT_PUBLIC_API_URL
RUN test -n "$NEXT_PUBLIC_API_URL" || (echo "ต้องระบุ --build-arg NEXT_PUBLIC_API_URL" && exit 1)
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# standalone = server.js + node_modules เท่าที่ใช้ (โครงสร้างตาม monorepo: apps/web/server.js)
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
