FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
ENV VITE_SSE_ORIGIN="" VITE_PRIVATE_PREVIEW=1
RUN corepack pnpm install --frozen-lockfile
# Static assets and API must come from the same frozen source revision.
RUN corepack pnpm --filter @workspace/boltnew-app build
RUN corepack pnpm --filter @workspace/api-server build

FROM node:24-bookworm-slim
ENV NODE_ENV=production APP_MODE=private-preview PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/artifacts/api-server/dist ./dist
USER node
EXPOSE 8080
CMD ["node","--dns-result-order=ipv4first","dist/index.mjs"]
