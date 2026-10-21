# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY extensions ./extensions
RUN npm ci --include=dev --no-audit --no-fund || npm install --include=dev --no-audit --no-fund
RUN npx tsc -b apps/server

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8800
ENV DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/package.json ./packages/core/package.json
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME [ "/data" ]
EXPOSE 8800
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8800/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD [ "node", "apps/server/dist/main.js" ]
