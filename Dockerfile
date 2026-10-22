# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/game-core/package.json packages/game-core/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY tools/balance-sim/package.json tools/balance-sim/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @trastero/shared --filter @trastero/game-core exec tsc -b \
 && pnpm --filter @trastero/client run build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=2567
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app ./
EXPOSE 2567
CMD ["node", "apps/server/node_modules/tsx/dist/cli.mjs", "apps/server/src/index.ts"]