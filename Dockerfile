# ---- build: instala dependencias y compila el frontend ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: solo dependencias de producción + frontend compilado ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --omit=dev --workspace @guadalupana/server --include-workspace-root=false && npm cache clean --force
COPY packages/shared/src packages/shared/src
COPY packages/server/src packages/server/src
COPY --from=build /app/packages/client/dist packages/client/dist

WORKDIR /app/packages/server
ENV PORT=3000 DB_PATH=/data/creditos.db CLIENT_DIST=/app/packages/client/dist
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3000
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
